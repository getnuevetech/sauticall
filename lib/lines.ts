import { getConnection, lookupOwnedDid, orderDid, pbxRequest } from "./carriers";
import { flagOn, getDb } from "./db";
import { enforceUser } from "./minutes";
import { nextOutboundPriority, outboundRuleBody, outboundScopeVerdict } from "./outbound-rule";
import { extensionRange, readExtensionPlan } from "./pbx";
import { idFromPbx } from "./pbx-id";
import { acceptedDepartmentName } from "./pbx-user";
import { ensureVoipClient, syncCustomerDids } from "./voip-client";
import { ensureSubaccount, getSubaccount } from "./voip-account";

type Line = { id: number; user_id: number; request_id: number; did: string; status: string; trunk_id: number; last_message: string };

function publicNumber(did: string) {
  const digits = did.replace(/\D/g, "");
  if (digits.length === 10) return `1${digits}`;
  return digits;
}

function departmentName(userId: number) {
  const row = getDb().prepare("SELECT name FROM pbx_departments WHERE user_id = ?").get(userId) as { name: string } | undefined;
  return acceptedDepartmentName(row?.name || "") || "Company name not set";
}

function extensionFor(userId: number) {
  const row = getDb().prepare("SELECT number FROM pbx_extensions WHERE user_id = ? AND status != 'removed' ORDER BY id LIMIT 1").get(userId) as { number: string } | undefined;
  return row?.number || String(extensionRange(userId, readExtensionPlan()).from);
}

function hideSecret(message: string, secret: string) {
  if (!secret) return message.slice(0, 400);
  return message.split(secret).join("[hidden]").slice(0, 400);
}

function openTask(lineId: number, userId: number, did: string, note: string) {
  const sub = getSubaccount(userId);
  getDb().prepare(
    `INSERT INTO trunk_tasks (line_id, user_id, did, department_name, extension_number, sip_user, sip_host, status, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
     ON CONFLICT(line_id) DO UPDATE SET status = 'open', note = excluded.note, sip_user = excluded.sip_user, sip_host = excluded.sip_host, department_name = excluded.department_name, extension_number = excluded.extension_number`,
  ).run(lineId, userId, did, departmentName(userId), extensionFor(userId), sub?.account || "", sub?.sip_host || "", note.slice(0, 500), new Date().toISOString());
  getDb().prepare("UPDATE phone_lines SET status = 'trunk_waiting', last_message = ? WHERE id = ?").run(note.slice(0, 400), lineId);
}

function extensionSpan(userId: number) {
  const department = getDb().prepare("SELECT number_from, number_to FROM pbx_departments WHERE user_id = ?").get(userId) as { number_from: string; number_to: string } | undefined;
  if (department && /^\d+$/.test(department.number_from) && /^\d+$/.test(department.number_to)) return { from: department.number_from, to: department.number_to };
  const range = extensionRange(userId, readExtensionPlan());
  return { from: String(range.from), to: String(range.to) };
}

async function addOutboundRule(input: { name: string; trunkId: number; callerId: string; from: string; to: string }) {
  const listed = await pbxRequest("OutboundRules?$select=Priority&$top=100");
  const created = await pbxRequest("OutboundRules", {
    method: "POST",
    body: outboundRuleBody({ ...input, priority: nextOutboundPriority(listed.body) }),
  });
  const id = idFromPbx(created.body, created.location);
  if (!created.ok || !id) return { ok: false, message: created.message || "3CX did not add the outbound rule." };
  const read = await pbxRequest(`OutboundRules(${id})`);
  if (outboundScopeVerdict(read.ok ? read.body : created.body, input.from, input.to) !== "scoped") {
    await pbxRequest(`OutboundRules(${id})`, { method: "DELETE" });
    return { ok: false, message: `3CX did not confirm the outbound rule is limited to extensions ${input.from}–${input.to}. The rule was removed.` };
  }
  return { ok: true, message: `Outbound calls for extensions ${input.from}–${input.to} use this number.` };
}

function trunkSeed(body: unknown) {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const value = record.value && typeof record.value === "object" && !Array.isArray(record.value) ? record.value as Record<string, unknown> : record;
  const copy = { ...value };
  for (const key of Object.keys(copy)) if (key.startsWith("@")) delete copy[key];
  return copy;
}

export async function attachTrunk(lineId: number) {
  const line = getDb().prepare("SELECT * FROM phone_lines WHERE id = ?").get(lineId) as Line | undefined;
  if (!line) return { ok: false, message: "That line was not found." };
  if (line.status === "trunk_live" && line.trunk_id) return { ok: true, message: "This number is already a trunk on the phone system." };
  const sub = getSubaccount(line.user_id);
  const span = extensionSpan(line.user_id);
  if (!sub) {
    const note = `VoIP.ms has no SIP account for this customer, so the number cannot be routed yet. Create the line account, then add the 3CX trunk, inbound route to extension ${extensionFor(line.user_id)}, and an outbound rule for extensions ${span.from}–${span.to}.`;
    openTask(line.id, line.user_id, line.did, note);
    return { ok: false, message: note };
  }
  if (!flagOn("pbx.live_trunk")) {
    const note = `Adding trunks on the phone system is turned off. VoIP.ms SIP account ${sub.account} at ${sub.sip_host || "the saved POP"} is ready. Add this number as a SIP trunk on the 3CX server, route inbound to extension ${extensionFor(line.user_id)}, and add an outbound rule limited to extensions ${span.from}–${span.to}.`;
    openTask(line.id, line.user_id, line.did, note);
    return { ok: false, message: note };
  }
  const rawTemplate = getConnection("3cx").public.trunk_template || "GenericSIPTrunk.pv.xml";
  const template = /^[\w.-]+$/.test(rawTemplate) ? rawTemplate : "GenericSIPTrunk.pv.xml";
  const number = publicNumber(line.did);
  const department = getDb().prepare("SELECT xapi_id, name FROM pbx_departments WHERE user_id = ?").get(line.user_id) as { xapi_id: number; name: string } | undefined;
  const extension = extensionFor(line.user_id);
  const seeded = await pbxRequest(`Trunks/Pbx.InitTrunk(template='${template}')`);
  const seed = seeded.ok ? trunkSeed(seeded.body) : null;
  const gateway = seed && seed.Gateway && typeof seed.Gateway === "object" ? { ...(seed.Gateway as Record<string, unknown>) } : {};
  if (sub.sip_host) gateway.Host = sub.sip_host;
  gateway.Port = gateway.Port || 5060;
  const body = {
    ...(seed || {}),
    Name: `SautiCall ${line.did}`,
    ExternalNumber: number,
    AuthID: sub.account,
    AuthPassword: sub.password,
    DidNumbers: [number],
    Gateway: Object.keys(gateway).length ? gateway : { Name: "VoIP.ms", Host: sub.sip_host, Port: 5060, Type: "Provider" },
    ...(department?.xapi_id ? { Groups: [{ GroupId: department.xapi_id }] } : {}),
  };
  const created = seed ? await pbxRequest("Trunks", { method: "POST", body }) : { ok: false, message: seeded.message, body: null, status: seeded.status, location: "" };
  let trunkId = idFromPbx(created.body, created.location);
  if (!created.ok || !trunkId) {
    const fallback = await pbxRequest("Trunks", {
      method: "POST",
      body: {
        Name: `SautiCall ${line.did}`,
        ExternalNumber: number,
        AuthID: sub.account,
        AuthPassword: sub.password,
        DidNumbers: [number],
        Gateway: { Name: "VoIP.ms", Host: sub.sip_host || "voip.ms", Port: 5060 },
        ...(department?.xapi_id ? { Groups: [{ GroupId: department.xapi_id }] } : {}),
      },
    });
    trunkId = idFromPbx(fallback.body, fallback.location);
    if (!fallback.ok || !trunkId) {
      const note = `VoIP.ms SIP account ${sub.account} at ${sub.sip_host || "the saved POP"} is ready. 3CX did not add the trunk. Add it on the server for ${department?.name || departmentName(line.user_id)}, route inbound ${line.did} to extension ${extension}, and add an outbound rule limited to extensions ${span.from}–${span.to}. ${hideSecret(fallback.message || created.message, sub.password)}`;
      openTask(line.id, line.user_id, line.did, note);
      return { ok: false, message: "3CX did not add the trunk. A task was saved for the team." };
    }
  }
  const rule = await pbxRequest("InboundRules", {
    method: "POST",
    body: {
      Name: `SautiCall ${line.did}`,
      DID: number,
      TrunkId: trunkId,
      OfficeHoursDestination: { To: "Extension", Number: extension, External: "" },
      OutOfOfficeHoursDestination: { To: "VoiceMail", Number: extension, External: "" },
    },
  });
  if (!rule.ok) {
    const note = `The trunk was created on 3CX. Inbound calls to extension ${extension} and outbound calls for extensions ${span.from}–${span.to} still need to be finished on the server. VoIP.ms SIP account ${sub.account} at ${sub.sip_host || "the saved POP"}. ${hideSecret(rule.message, sub.password)}`;
    getDb().prepare("UPDATE phone_lines SET trunk_id = ?, status = 'trunk_waiting', last_message = ? WHERE id = ?").run(trunkId, note.slice(0, 400), line.id);
    openTask(line.id, line.user_id, line.did, note);
    return { ok: false, message: "The trunk exists, but inbound and outbound still need a person." };
  }
  const outbound = await addOutboundRule({ name: `SautiCall ${line.did}`, trunkId, callerId: `+${number}`, from: span.from, to: span.to });
  if (!outbound.ok) {
    const note = `The trunk is on 3CX and inbound calls go to extension ${extension}. ${outbound.message} Add that outbound rule on the server. VoIP.ms SIP account ${sub.account} at ${sub.sip_host || "the saved POP"}.`;
    getDb().prepare("UPDATE phone_lines SET trunk_id = ?, status = 'trunk_waiting', last_message = ? WHERE id = ?").run(trunkId, note.slice(0, 400), line.id);
    openTask(line.id, line.user_id, line.did, note);
    return { ok: false, message: "Inbound is connected. Outbound still needs the team." };
  }
  const done = `This number is a trunk on the phone system. ${outbound.message}`;
  getDb().prepare("UPDATE phone_lines SET trunk_id = ?, status = 'trunk_live', last_message = ? WHERE id = ?").run(trunkId, done.slice(0, 400), line.id);
  getDb().prepare("UPDATE trunk_tasks SET status = 'done', note = ? WHERE line_id = ?").run(done.slice(0, 500), line.id);
  return { ok: true, message: done };
}

export function markTrunkDone(lineId: number, note: string) {
  const line = getDb().prepare("SELECT id FROM phone_lines WHERE id = ?").get(lineId) as { id: number } | undefined;
  if (!line) return { ok: false, message: "That line was not found." };
  const text = note.trim().slice(0, 400) || "Added on the 3CX server.";
  getDb().prepare("UPDATE phone_lines SET status = 'trunk_done', last_message = ? WHERE id = ?").run(text, lineId);
  getDb().prepare("UPDATE trunk_tasks SET status = 'done', note = ? WHERE line_id = ?").run(text, lineId);
  return { ok: true, message: text };
}

export async function purchaseNumber(input: { requestId: number; userId: number; did: string }): Promise<{ ok: boolean; pending?: boolean; message: string }> {
  let sent = false;
  try {
    const client = await ensureVoipClient(input.userId);
    if (!client.ok) return { ok: false, message: "The phone company account for this customer is not ready yet. An administrator can finish it on the customer page." };
    const sub = await ensureSubaccount(input.userId, client.clientId);
    if (!sub.ok) {
      getDb().prepare("UPDATE voip_clients SET last_message = ?, updated_at = ? WHERE user_id = ?").run(sub.message.slice(0, 400), new Date().toISOString(), input.userId);
      return { ok: false, message: "The phone company line for this customer is not ready yet. An administrator can finish it on the customer page." };
    }
    const current = await lookupOwnedDid(input.did);
    if (!current.ok) return { ok: false, message: `VoIP.ms could not be checked before buying (${current.message}).` };
    if (!current.owned) {
      const ordered = await orderDid(input.did, `account:${sub.account}`, sub.account);
      if (!ordered.ok) return { ok: false, message: `VoIP.ms did not buy this number (${ordered.message}).` };
      sent = true;
      const owned = await lookupOwnedDid(input.did);
      if (!owned.ok) return { ok: false, pending: true, message: `The order was sent, but VoIP.ms did not confirm this number (${owned.message}).` };
      if (!owned.owned) return { ok: false, message: "VoIP.ms did not add this number to the account." };
    } else {
      sent = true;
    }
    const existing = getDb().prepare("SELECT id FROM phone_lines WHERE request_id = ?").get(input.requestId) as { id: number } | undefined;
    let lineId = existing?.id || 0;
    if (!lineId) {
      const info = getDb().prepare(
        "INSERT INTO phone_lines (user_id, request_id, did, status, trunk_id, last_message, created_at) VALUES (?, ?, ?, 'ordered', 0, '', ?)",
      ).run(input.userId, input.requestId, input.did, new Date().toISOString());
      lineId = Number(info.lastInsertRowid);
    }
    await syncCustomerDids(input.userId);
    const trunk = await attachTrunk(lineId);
    const limited = await enforceUser(input.userId);
    const { sendEmergency } = await import("./e911");
    const emergency = await sendEmergency(lineId);
    const message = `${trunk.message} ${limited.message} ${emergency.message}`.trim();
    return { ok: true, message };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "The purchase could not be finished.";
    console.error("[sauticall] purchase", detail);
    if (sent) return { ok: false, pending: true, message: "The order was sent, but connecting this number could not be finished." };
    return { ok: false, message: "The phone company could not be reached. Try again shortly." };
  }
}
