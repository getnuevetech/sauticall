import { getConnection, lookupOwnedDid, orderDid, pbxRequest } from "./carriers";
import { lookupMayOrder } from "./did-list";
import { recordFailure } from "./failure-log";
import { balanceCovers, resellerOrderFees } from "./client-funding";
import { flagOn, getDb } from "./db";
import { finishAfterResponse } from "./later";
import { enforceUser } from "./minutes";
import { nextOutboundPriority, outboundRuleBody, outboundScopeVerdict } from "./outbound-rule";
import { extensionRange, paidPlan, readExtensionPlan } from "./pbx";
import { idFromPbx } from "./pbx-id";
import { mentionsDelta, trunkDeltaLists, trunkGroupBody, trunkPostBody, trunkReplayBody, omittedTrunkFields, wrapCollections } from "./trunk-body";
import { acceptedDepartmentName } from "./pbx-user";
import { billDidToClient, ensureVoipClient, getVoipClient, readFundedBalance } from "./voip-client";
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
  if (!secret) return message.slice(0, 1200);
  return message.split(secret).join("[hidden]").slice(0, 1200);
}

function openTask(lineId: number, userId: number, did: string, note: string) {
  const sub = getSubaccount(userId);
  getDb().prepare(
    `INSERT INTO trunk_tasks (line_id, user_id, did, department_name, extension_number, sip_user, sip_host, status, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
     ON CONFLICT(line_id) DO UPDATE SET status = 'open', note = excluded.note, sip_user = excluded.sip_user, sip_host = excluded.sip_host, department_name = excluded.department_name, extension_number = excluded.extension_number`,
  ).run(lineId, userId, did, departmentName(userId), extensionFor(userId), sub?.account || "", sub?.sip_host || "", note.slice(0, 1200), new Date().toISOString());
  getDb().prepare("UPDATE phone_lines SET status = 'trunk_waiting', last_message = ? WHERE id = ?").run(note.slice(0, 900), lineId);
}

function extensionSpan(userId: number) {
  const department = getDb().prepare("SELECT number_from, number_to FROM pbx_departments WHERE user_id = ?").get(userId) as { number_from: string; number_to: string } | undefined;
  if (department && /^\d+$/.test(department.number_from) && /^\d+$/.test(department.number_to)) return { from: department.number_from, to: department.number_to };
  const range = extensionRange(userId, readExtensionPlan());
  return { from: String(range.from), to: String(range.to) };
}

async function addOutboundRule(input: { name: string; trunkId: number; callerId: string; from: string; to: string }) {
  const listed = await pbxRequest("OutboundRules?$select=Priority&$top=100");
  const ruleBody = outboundRuleBody({ ...input, priority: nextOutboundPriority(listed.body) });
  let created = await pbxRequest("OutboundRules", {
    method: "POST",
    body: ruleBody,
  });
  if (!created.ok && mentionsDelta(created.message || "")) {
    created = await pbxRequest("OutboundRules", {
      method: "POST",
      body: wrapCollections(ruleBody, ["Routes", "DNRanges"]),
    });
  }
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
  return { ...value };
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
  const seeded = await pbxRequest(`Trunks/Pbx.InitTrunk(template=${encodeURIComponent(`'${template}'`)})`);
  const seed = seeded.ok ? trunkSeed(seeded.body) : null;
  const replay = trunkReplayBody({
    seed,
    name: `SautiCall ${line.did}`,
    number,
    authId: sub.account,
    password: sub.password,
    host: sub.sip_host || "",
    template,
  });
  const cleaned = trunkPostBody(trunkDeltaLists(replay));
  const attempts = [
    ["clean", cleaned],
    ["wrapped", { delta: cleaned }],
  ] as const;
  let created = await pbxRequest("Trunks", { method: "POST", body: attempts[0][1] });
  let trunkId = idFromPbx(created.body, created.location);
  const failures = [`${attempts[0][0]}: ${created.message}`];
  for (const [label, attempt] of attempts.slice(1)) {
    if (created.ok && trunkId) break;
    if (created.status !== 400) break;
    created = await pbxRequest("Trunks", { method: "POST", body: attempt });
    trunkId = idFromPbx(created.body, created.location);
    failures.push(`${label}: ${created.message}`);
  }
  if (!created.ok || !trunkId) failures.unshift(`omitted ${omittedTrunkFields(trunkDeltaLists(replay)).join(",") || "none"}`);
  if (!seeded.ok) failures.push(`template request: ${seeded.message || "3CX did not return a trunk template."}`);
  if (!created.ok || !trunkId) {
    const note = `VoIP.ms SIP account ${sub.account} at ${sub.sip_host || "the saved POP"} is ready. 3CX did not add the trunk. Add it on the server for ${department?.name || departmentName(line.user_id)}, route inbound ${line.did} to extension ${extension}, and add an outbound rule limited to extensions ${span.from}–${span.to}. ${hideSecret(failures.filter(Boolean).join(" | "), sub.password)}`;
    openTask(line.id, line.user_id, line.did, note);
    recordFailure({ area: "trunk", userId: line.user_id, subject: line.did, detail: note });
    return { ok: false, message: "3CX did not add the trunk. A task was saved for the team." };
  }
  let departmentNote = "";
  if (department?.xapi_id) {
    const group = trunkGroupBody(department.xapi_id);
    let grouped = await pbxRequest(`Trunks(${trunkId})`, { method: "PATCH", body: group });
    if (!grouped.ok && grouped.status === 400) {
      grouped = await pbxRequest(`Trunks(${trunkId})`, {
        method: "PATCH",
        body: { Groups: { "@odata.type": "#Collection(Pbx.UserGroup)", delta: group.Groups } },
      });
    }
    if (!grouped.ok) departmentNote = ` The trunk is not limited to ${department.name} yet.`;
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
    recordFailure({ area: "trunk", userId: line.user_id, subject: line.did, detail: note });
    return { ok: false, message: "The trunk exists, but inbound and outbound still need a person." };
  }
  const outbound = await addOutboundRule({ name: `SautiCall ${line.did}`, trunkId, callerId: number, from: span.from, to: span.to });
  if (!outbound.ok) {
    const note = `The trunk is on 3CX and inbound calls go to extension ${extension}. ${outbound.message} Add that outbound rule on the server. VoIP.ms SIP account ${sub.account} at ${sub.sip_host || "the saved POP"}.`;
    getDb().prepare("UPDATE phone_lines SET trunk_id = ?, status = 'trunk_waiting', last_message = ? WHERE id = ?").run(trunkId, note.slice(0, 400), line.id);
    openTask(line.id, line.user_id, line.did, note);
    recordFailure({ area: "trunk", userId: line.user_id, subject: line.did, detail: note });
    return { ok: false, message: "Inbound is connected. Outbound still needs the team." };
  }
  const done = `This number is a trunk on the phone system. ${outbound.message}${departmentNote}`;
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

function storedMonthly(requestId: number, fallback: string) {
  const row = getDb().prepare("SELECT payload FROM account_requests WHERE id = ?").get(requestId) as { payload: string } | undefined;
  try {
    const monthly = String((JSON.parse(row?.payload || "{}") as { monthly?: string }).monthly || "");
    return monthly || fallback;
  } catch {
    return fallback;
  }
}

export async function purchaseNumber(input: { requestId: number; userId: number; did: string; monthly?: string }): Promise<{ ok: boolean; pending?: boolean; message: string; detail: string }> {
  let sent = false;
  const stop = (message: string, detail: string, pending = false) => {
    recordFailure({ area: "number", userId: input.userId, subject: input.did, detail });
    getDb().prepare("UPDATE voip_clients SET last_message = ?, updated_at = ? WHERE user_id = ?").run(detail.slice(0, 400), new Date().toISOString(), input.userId);
    return { ok: false as const, pending, message, detail };
  };
  try {
    const client = await ensureVoipClient(input.userId);
    if (!client.ok) return stop("The phone company account for this customer is not ready yet. An administrator can finish it on the customer page.", client.message);
    const chargeClient = flagOn("billing.fund_client");
    const fees = resellerOrderFees({ chargeClient, monthly: input.monthly || storedMonthly(input.requestId, "") });
    if (chargeClient) {
      const plan = paidPlan(input.userId);
      if (!plan) return stop("A paid plan has to add phone-company balance before a number can be bought.", "No paid plan is on this customer, so VoIP.ms was not asked to order the number.");
      const { fundPaidPlan } = await import("./voip-client");
      const funded = await fundPaidPlan(input.userId, plan.name);
      if (!funded.ok) return stop(funded.message, funded.message);
      const balance = await readFundedBalance(client.clientId);
      const marked = getVoipClient(input.userId);
      if ((marked?.funded_cents || 0) <= 0 && (balance == null || balance <= 0)) {
        return stop("The phone-company balance for this plan is not on the account yet.", `Client ${client.clientId} balance was ${balance == null ? "unreadable" : balance.toFixed(2)} after funding ${plan.name}.`);
      }
      if (!balanceCovers(balance, fees)) return stop("This account does not have enough phone-company balance to buy that number yet.", `Client ${client.clientId} balance ${balance?.toFixed(2)} does not cover monthly ${fees.monthly} and setup ${fees.setup}.`);
    }
    const sub = await ensureSubaccount(input.userId, client.clientId);
    if (!sub.ok) return stop("The phone company line for this customer is not ready yet. An administrator can finish it on the customer page.", sub.message);
    if (sub.warning) recordFailure({ area: "client", userId: input.userId, subject: sub.account, detail: sub.warning });
    const current = await lookupOwnedDid(input.did);
    if (!current.ok && !lookupMayOrder(current)) return stop("The phone company could not be checked before buying. Try again shortly.", `getDIDsInfo ${input.did}: ${current.message}`);
    let chargedOnOrder = false;
    if (lookupMayOrder(current)) {
      const mainRouting = getConnection("voipms").public.routing;
      const lineRouting = `account:${sub.account}`;
      let ordered = await orderDid(input.did, lineRouting, sub.account, fees);
      const tries = [`orderDID ${lineRouting} account ${sub.account}: ${ordered.message}`];
      if (!current.ok) tries.unshift(`getDIDsInfo ${input.did}: ${current.message}`);
      chargedOnOrder = ordered.ok;
      if (!ordered.ok && /account|monthly|setup|minute|parameter|rate|balance|routing|fund|credit/i.test(`${ordered.status} ${ordered.message}`) && mainRouting && mainRouting !== lineRouting) {
        ordered = await orderDid(input.did, mainRouting);
        chargedOnOrder = false;
        tries.push(`orderDID ${mainRouting}: ${ordered.message}`);
      }
      if (!ordered.ok) return stop("The phone company did not buy this number. The balance and line account need another look.", tries.join(" | "));
      sent = true;
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
    const linked = await billDidToClient(input.did, sub.account, fees, chargedOnOrder);
    if (linked) {
      recordFailure({ area: "number", userId: input.userId, subject: input.did, detail: `connectDID ${input.did} to ${sub.account} returned ${linked}.` });
    }
    const confirmed = await lookupOwnedDid(input.did);
    const userId = input.userId;
    finishAfterResponse(async () => {
      await attachTrunk(lineId);
      await enforceUser(userId);
      const { sendEmergency } = await import("./e911");
      await sendEmergency(lineId);
    });
    if (!confirmed.ok || !confirmed.owned) {
      const reason = confirmed.ok ? `orderDID succeeded but getDIDsInfo does not list ${input.did} yet.` : `orderDID succeeded. getDIDsInfo ${input.did}: ${confirmed.message}`;
      const linkNote = linked ? ` connectDID to ${sub.account} returned ${linked}.` : ` connectDID to ${sub.account} was sent.`;
      return stop("The order was sent, but the phone company has not listed this number yet.", `${reason}${linkNote}`, true);
    }
    if (linked) return { ok: false, pending: true, message: "The number was ordered. Linking it to the phone-company account still needs another look.", detail: `Number ${input.did} was ordered. connectDID to ${sub.account} returned ${linked}.` };
    const bought = "This number was bought on the phone-company account.";
    return { ok: true, message: bought, detail: bought };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "The purchase could not be finished.";
    if (sent) return stop("The order was sent, but connecting this number could not be finished.", detail, true);
    return stop("The phone company could not be reached. Try again shortly.", detail);
  }
}
