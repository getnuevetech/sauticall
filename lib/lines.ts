import { getConnection, lookupOwnedDid, orderDid, pbxRequest } from "./carriers";
import { lookupMayOrder } from "./did-list";
import { recordFailure } from "./failure-log";
import { balanceCovers, resellerOrderFees } from "./client-funding";
import { flagOn, getDb } from "./db";
import { finishAfterResponse } from "./later";
import { enforceUser } from "./minutes";
import { nextOutboundPriority, outboundRuleBody, outboundScopeVerdict } from "./outbound-rule";
import { extensionRange, paidPlan, readExtensionPlan } from "./pbx";
import { firstListedId, idFromPbx } from "./pbx-id";
import { manualTrunkNote, mentionsDelta, readTrunkIdentity, redactProvisioning, redactTrunkBody, trunkConnectionClass, trunkDialedNumber, trunkGroupBody, trunkIdForDid, trunkPassthroughBody, trunkProvisionVerdict, trunkTemplateName, wrapCollections } from "./trunk-body";
import { shownAccountName } from "./pbx-user";
import { carrierDidRef, numberIsBought, orderTimedOut } from "./number-order";
import { automaticStopNote, trunkMayAutoTry } from "./trunk-tries";
import { inboundDestinationUpdate, inboundRuleAttempts, trunkNameFromAccount, trunkRouteAttempts, trunkStatusNote } from "./trunk-route";
import { ensureTrunkDefaults, savedDefaultRoute } from "./trunk-prereq";
import { inboundRuleFound, outboundAssignedToDepartment, outboundRuleFound, outboundRuleId, portNumbers, trunkDepartmentLimit, trunkRoutingRules } from "./trunk-routes";
import { billDidToClient, ensureVoipClient, getVoipClient, readFundedBalance } from "./voip-client";
import { ensureSubaccount, getSubaccount } from "./voip-account";

type Line = { id: number; user_id: number; request_id: number; did: string; status: string; trunk_id: number; trunk_number: string; trunk_routes: number; last_message: string };

function departmentName(userId: number) {
  const row = getDb().prepare("SELECT name FROM pbx_departments WHERE user_id = ?").get(userId) as { name: string } | undefined;
  const person = getDb().prepare("SELECT name, business_name FROM users WHERE id = ?").get(userId) as { name: string; business_name: string } | undefined;
  return shownAccountName(row?.name || "", person?.business_name || "", person?.name || "") || "Company name not set";
}

function extensionFor(userId: number) {
  const row = getDb().prepare("SELECT number FROM pbx_extensions WHERE user_id = ? AND status != 'removed' ORDER BY id LIMIT 1").get(userId) as { number: string } | undefined;
  return row?.number || String(extensionRange(userId, readExtensionPlan()).from);
}

function hideSecret(message: string, secret: string) {
  return redactProvisioning(message, [secret]);
}

function saveTrunkState(lineId: number, input: {
  trunkId: number;
  trunkNumber: string;
  inbound: boolean;
  outbound: boolean;
  departmentLimited: boolean;
  ruleGroup: boolean;
  routeLabel: string;
  note: string;
  registered: boolean;
}) {
  const routes = input.inbound && input.outbound && input.departmentLimited && input.ruleGroup ? 1 : 0;
  const certified = routes === 1 && input.registered;
  getDb().prepare(
    `UPDATE phone_lines
     SET trunk_id = ?, trunk_number = ?, trunk_routes = ?, trunk_inbound = ?, trunk_outbound = ?, trunk_department = ?, trunk_rule_group = ?, route_label = ?, status = ?, last_message = ?
     WHERE id = ?`,
  ).run(
    input.trunkId,
    input.trunkNumber,
    routes,
    input.inbound ? 1 : 0,
    input.outbound ? 1 : 0,
    input.departmentLimited ? 1 : 0,
    input.ruleGroup ? 1 : 0,
    input.routeLabel.slice(0, 120),
    certified ? "trunk_live" : "trunk_waiting",
    input.note.slice(0, 2000),
    lineId,
  );
  if (certified) getDb().prepare("UPDATE trunk_tasks SET status = 'done', note = ? WHERE line_id = ?").run(input.note.slice(0, 2000), lineId);
  return certified;
}

function openTask(lineId: number, userId: number, did: string, note: string) {
  const sub = getSubaccount(userId);
  getDb().prepare(
    `INSERT INTO trunk_tasks (line_id, user_id, did, department_name, extension_number, sip_user, sip_host, status, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
     ON CONFLICT(line_id) DO UPDATE SET status = 'open', note = excluded.note, sip_user = excluded.sip_user, sip_host = excluded.sip_host, department_name = excluded.department_name, extension_number = excluded.extension_number`,
  ).run(lineId, userId, did, departmentName(userId), extensionFor(userId), sub?.account || "", sub?.sip_host || "", note.slice(0, 2000), new Date().toISOString());
  getDb().prepare("UPDATE phone_lines SET status = 'trunk_waiting', last_message = ? WHERE id = ?").run(note.slice(0, 2000), lineId);
}

async function pbxWrite(path: string, init: { method?: string; body?: unknown }) {
  return pbxRequest(path, init);
}

function extensionSpan(userId: number) {
  const department = getDb().prepare("SELECT number_from, number_to FROM pbx_departments WHERE user_id = ?").get(userId) as { number_from: string; number_to: string } | undefined;
  if (department && /^\d+$/.test(department.number_from) && /^\d+$/.test(department.number_to)) return { from: department.number_from, to: department.number_to };
  const range = extensionRange(userId, readExtensionPlan());
  return { from: String(range.from), to: String(range.to) };
}

async function addOutboundRule(input: { name: string; trunkId: number; callerId: string; from: string; to: string; groupId?: number }) {
  const listed = await pbxRequest("OutboundRules?$select=Priority&$top=100");
  const ruleBody = outboundRuleBody({ ...input, priority: nextOutboundPriority(listed.body) });
  let created = await pbxWrite("OutboundRules", { method: "POST", body: ruleBody });
  if (!created.ok && mentionsDelta(created.message || "")) {
    created = await pbxWrite("OutboundRules", {
      method: "POST",
      body: wrapCollections(ruleBody, ["Routes", "DNRanges", "GroupIds"]),
    });
  }
  if (!created.ok && input.groupId) {
    const { GroupIds: _groupIds, ...withoutGroup } = ruleBody;
    created = await pbxWrite("OutboundRules", { method: "POST", body: withoutGroup });
    if (!created.ok && mentionsDelta(created.message || "")) {
      created = await pbxWrite("OutboundRules", { method: "POST", body: wrapCollections(withoutGroup, ["Routes", "DNRanges"]) });
    }
  }
  const id = idFromPbx(created.body, created.location);
  if (!created.ok && /duplicate|already exists/i.test(created.message || "")) {
    const listedRules = await pbxRequest("OutboundRules?$top=100");
    const existingId = listedRules.ok ? outboundRuleId(listedRules.body, input.trunkId, input.from, input.to) : 0;
    let assigned = false;
    if (existingId && input.groupId) {
      let patched = await pbxWrite(`OutboundRules(${existingId})`, { method: "PATCH", body: { GroupIds: [input.groupId] } });
      if (!patched.ok && mentionsDelta(patched.message || "")) {
        patched = await pbxWrite(`OutboundRules(${existingId})`, {
          method: "PATCH",
          body: { GroupIds: { "@odata.type": "#Collection(Int32)", delta: [input.groupId] } },
        });
      }
      assigned = patched.ok;
    }
    return {
      ok: true,
      assigned,
      message: assigned
        ? "An outbound rule for this number is already on the phone system. It is assigned to the department."
        : "An outbound rule for this number is already on the phone system. Its department assignment was not changed.",
    };
  }
  if (!created.ok || !id) return { ok: false, assigned: false, message: created.message || "3CX did not add the outbound rule." };
  const read = await pbxRequest(`OutboundRules(${id})`);
  if (outboundScopeVerdict(read.ok ? read.body : created.body, input.from, input.to) !== "scoped") {
    await pbxRequest(`OutboundRules(${id})`, { method: "DELETE" });
    return { ok: false, assigned: false, message: `3CX did not confirm the outbound rule is limited to extensions ${input.from}–${input.to}. The rule was removed.` };
  }
  let assigned = Boolean(input.groupId) && outboundAssignedToDepartment(read.ok ? read.body : created.body, input.trunkId, input.from, input.to, input.groupId || 0);
  if (input.groupId && !assigned) {
    let patched = await pbxWrite(`OutboundRules(${id})`, { method: "PATCH", body: { GroupIds: [input.groupId] } });
    if (!patched.ok && mentionsDelta(patched.message || "")) {
      patched = await pbxWrite(`OutboundRules(${id})`, {
        method: "PATCH",
        body: { GroupIds: { "@odata.type": "#Collection(Int32)", delta: [input.groupId] } },
      });
    }
    assigned = patched.ok;
  }
  const scope = `Outbound calls for extensions ${input.from}–${input.to} use this number.`;
  const groupNote = !input.groupId ? "" : assigned ? " The outbound rule is assigned to the department." : " The outbound rule is not assigned to the department yet.";
  return { ok: true, assigned, message: `${scope}${groupNote}` };
}

async function saveInboundRoute(input: { name: string; did: string; trunkId: number; to: "Extension" | "RingGroup"; number: string; label: string }) {
  const listed = await pbxRequest(`Trunks(${input.trunkId})?$expand=RoutingRules`);
  const rules = listed.ok ? trunkRoutingRules(listed.body) : [];
  const failures: string[] = [];
  let updated = 0;
  for (const rule of rules) {
    let patched = await pbxWrite(`InboundRules(${rule.id})`, { method: "PATCH", body: inboundDestinationUpdate(input.to, input.number) });
    if (!patched.ok && mentionsDelta(patched.message || "")) {
      patched = await pbxWrite(`InboundRules(${rule.id})`, { method: "PATCH", body: inboundDestinationUpdate(input.to, input.number, "delta") });
    }
    if (patched.ok) updated += 1;
    else failures.push(patched.message || `3CX did not update inbound rule ${rule.id}.`);
  }
  let created = false;
  if (!rules.length || updated === 0) {
    let last = "3CX did not add the inbound route.";
    for (const body of inboundRuleAttempts(input)) {
      const rule = await pbxWrite("InboundRules", { method: "POST", body });
      if (rule.ok || /duplicate|already exists/i.test(`${rule.message} ${rule.code || ""}`)) {
        created = true;
        break;
      }
      last = rule.message || last;
    }
    if (!created) failures.push(last);
  }
  let replaced = false;
  if (!updated && !created) {
    let last = "3CX did not save the trunk default route.";
    for (const body of trunkRouteAttempts({ did: input.did, to: input.to, number: input.number })) {
      const routed = await pbxWrite(`Trunks(${input.trunkId})`, { method: "PATCH", body });
      if (routed.ok || /duplicate|already exists/i.test(routed.message || "")) {
        replaced = true;
        break;
      }
      last = routed.message || last;
    }
    if (!replaced) failures.push(last);
  }
  if (updated || created || replaced) {
    const where = input.label || (input.to === "RingGroup" ? `ring group ${input.number}` : `extension ${input.number}`);
    const saved = updated ? `The trunk default route now points to ${where} for office hours and after hours.` : `The inbound route points to ${where} for office hours and after hours.`;
    return { ok: true, message: saved };
  }
  return { ok: false, message: failures.filter(Boolean)[0] || "The inbound route is not on 3CX." };
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
  const prepared = await ensureTrunkDefaults(line.user_id);
  if (!prepared.ok) {
    const note = line.trunk_id
      ? `${prepared.message} 3CX trunk id ${line.trunk_id}${line.trunk_number ? `, internal number ${line.trunk_number}` : ""} is already saved. Routing was not changed.`
      : `${prepared.message} The trunk was not added.`;
    openTask(line.id, line.user_id, line.did, note);
    recordFailure({ area: "trunk", userId: line.user_id, subject: line.did, detail: note });
    return { ok: false, message: note.slice(0, 500) };
  }
  const sub = getSubaccount(line.user_id);
  const span = { from: prepared.from, to: prepared.to };
  const extension = prepared.extensionNumber;
  const company = prepared.departmentName;
  const routeLabel = prepared.target.label;
  if (!sub) {
    const note = `Department ${company} is on 3CX. ${routeLabel} is ready. VoIP.ms has no SIP account for this customer, so the trunk was not added. After the SIP account exists, add the trunk, set the default route to ${routeLabel} for office hours and after hours, limit the trunk to ${company}, and add an outbound rule for extensions ${span.from}–${span.to} assigned to ${company}.`;
    openTask(line.id, line.user_id, line.did, note);
    getDb().prepare("UPDATE phone_lines SET route_label = ? WHERE id = ?").run(routeLabel.slice(0, 120), line.id);
    return { ok: false, message: note.slice(0, 500) };
  }
  if (!flagOn("pbx.live_trunk")) {
    const note = `Adding trunks on the phone system is turned off. Department ${company} is on 3CX and ${routeLabel} is ready. VoIP.ms SIP account ${sub.account} at ${sub.sip_host || "the saved POP"} is ready. Add the SIP trunk, set the default route to ${routeLabel} for office hours and after hours, limit the trunk to ${company}, and add an outbound rule for extensions ${span.from}–${span.to} assigned to ${company}.`;
    openTask(line.id, line.user_id, line.did, note);
    getDb().prepare("UPDATE phone_lines SET route_label = ? WHERE id = ?").run(routeLabel.slice(0, 120), line.id);
    return { ok: false, message: note.slice(0, 500) };
  }
  const template = trunkTemplateName(getConnection("3cx").public.trunk_template || "");
  const number = trunkDialedNumber(line.did);
  const accountName = trunkNameFromAccount(sub.account);
  const gatewayName = accountName || `${company || "SautiCall"} - VoIP.ms ${number}`.replace(/'/g, "").slice(0, 80);
  let trunkId = line.trunk_id || 0;
  if (trunkId) {
    const saved = await pbxRequest(`Trunks(${trunkId})?$select=Id`);
    if (!saved.ok) trunkId = 0;
  }
  if (!trunkId) {
    const found = await pbxRequest("Trunks?$top=100&$select=Id,ExternalNumber,DidNumbers");
    trunkId = found.ok ? trunkIdForDid(found.body, number) : 0;
  }
  if (!trunkId && accountName) {
    const named = await pbxRequest(`Trunks?$filter=${encodeURIComponent(`Name eq '${accountName}'`)}&$select=Id&$top=1`);
    trunkId = named.ok ? firstListedId(named.body) : 0;
  }
  const seeded = trunkId ? { ok: true, message: "", body: null } : await pbxRequest(`Trunks/Pbx.InitTrunk(template=${encodeURIComponent(`'${template}'`)})`);
  const seed = seeded.ok ? trunkSeed(seeded.body) : null;
  const handoff = (reason: string, requestBody?: Record<string, unknown>) => {
    const kind = trunkConnectionClass(reason);
    const posted = requestBody ? JSON.stringify(redactTrunkBody(requestBody)) : "";
    const note = hideSecret(manualTrunkNote({
      company,
      did: line.did,
      dialed: number,
      extension,
      from: span.from,
      to: span.to,
      account: sub.account,
      host: sub.sip_host || "",
      routeLabel,
      reason: [kind, reason, posted].filter(Boolean).join(" "),
    }), sub.password);
    openTask(line.id, line.user_id, line.did, note);
    recordFailure({ area: "trunk", userId: line.user_id, subject: line.did, detail: note });
    return { ok: false as const, message: note.slice(0, 500) };
  };
  if (!trunkId && (!seeded.ok || !seed)) return handoff(seeded.message || "3CX did not return a trunk template.");
  if (!trunkId && seed) {
    const proposed = String(seed.Number || "").replace(/\D/g, "");
    if (proposed) {
      const taken = await pbxRequest(`Trunks?$filter=${encodeURIComponent(`Number eq '${proposed}'`)}&$select=Id&$top=1`);
      if (taken.ok && firstListedId(taken.body)) return handoff(`Trunk number ${proposed} is already used. InitTrunk must be requested again before another trunk is created.`);
    }
  }
  const postedBody = trunkId ? null : trunkPassthroughBody({
    seed,
    name: gatewayName,
    number,
    authId: sub.account,
    password: sub.password,
    host: sub.sip_host || "",
    template,
  });
  const created = trunkId
    ? { ok: true, status: 200, message: "An existing trunk was found and was not created again.", body: null, location: "" }
    : await pbxRequest("Trunks", {
      method: "POST",
      body: postedBody,
      contentType: "application/json",
    });
  if (!trunkId) trunkId = idFromPbx(created.body, created.location) || readTrunkIdentity(created.body).id;
  const createdIdentity = readTrunkIdentity(created.body);
  if (!created.ok || !trunkId) return handoff(created.message || "3CX did not add the trunk.", postedBody || undefined);
  let trunkNumber = createdIdentity.number || line.trunk_number || "";
  const group = trunkGroupBody(prepared.departmentId);
  let grouped = await pbxWrite(`Trunks(${trunkId})`, { method: "PATCH", body: group });
  if (!grouped.ok && (grouped.status === 400 || mentionsDelta(grouped.message || ""))) {
    grouped = await pbxWrite(`Trunks(${trunkId})`, {
      method: "PATCH",
      body: { Groups: { "@odata.type": "#Collection(Pbx.UserGroup)", delta: group.Groups } },
    });
  }
  const departmentLimited = grouped.ok;
  const inbound = await saveInboundRoute({
    name: `SautiCall ${line.did}`,
    did: number,
    trunkId,
    to: prepared.target.to,
    number: prepared.target.number,
    label: prepared.target.label,
  });
  const inboundOnPbx = inbound.ok;
  const outbound = await addOutboundRule({
    name: `SautiCall ${line.did}`,
    trunkId,
    callerId: number,
    from: span.from,
    to: span.to,
    groupId: prepared.departmentId,
  });
  const detail = await pbxRequest(`Trunks(${trunkId})?$select=Id,Number,IsOnline,Groups`);
  const identity = readTrunkIdentity(detail.ok ? detail.body : created.body);
  if (identity.number) trunkNumber = identity.number;
  const limitRead = detail.ok ? trunkDepartmentLimit(detail.body, prepared.departmentId) : "unknown";
  const limited = limitRead === "yes" || (limitRead === "unknown" && departmentLimited);
  const verdict = trunkProvisionVerdict({
    registered: Boolean(detail.ok && identity.registered),
    inbound: inboundOnPbx,
    outbound: outbound.ok,
    outboundAssigned: outbound.ok && outbound.assigned,
    departmentLimited: limited,
  });
  const detailText = [
    inbound.message,
    outbound.ok ? outbound.message : outbound.message,
    limited ? "" : grouped.message || `The trunk is not limited to ${company}.`,
    verdict.reason,
  ].filter(Boolean).join(" ");
  const note = hideSecret(trunkStatusNote({
    trunkId,
    trunkNumber,
    departmentName: company,
    departmentOnPbx: true,
    extension,
    extensionOnPbx: true,
    routeLabel,
    routeOnPbx: true,
    inboundOnPbx,
    outboundOnPbx: outbound.ok,
    outboundAssigned: outbound.ok && outbound.assigned,
    departmentLimited: limited,
    from: span.from,
    to: span.to,
    account: sub.account,
    host: sub.sip_host || "",
    detail: detailText,
  }), sub.password);
  const certified = saveTrunkState(line.id, {
    trunkId,
    trunkNumber,
    inbound: inboundOnPbx,
    outbound: outbound.ok,
    departmentLimited: limited,
    ruleGroup: outbound.ok && outbound.assigned,
    routeLabel,
    note,
    registered: verdict.complete,
  });
  const routesReady = inboundOnPbx && outbound.ok && outbound.assigned && limited;
  if (certified) {
    getDb().prepare("UPDATE trunk_tasks SET status = 'done', note = ? WHERE line_id = ?").run(note, line.id);
  } else {
    openTask(line.id, line.user_id, line.did, note);
    if (routesReady) scheduleRegistrationChecks([line.id]);
  }
  if (!routesReady) recordFailure({ area: "trunk", userId: line.user_id, subject: line.did, detail: note });
  return { ok: routesReady || certified, message: note.slice(0, 500) };
}

export async function certifyTrunk(lineId: number, adminNote = "") {
  const line = getDb().prepare("SELECT id, status, trunk_id, trunk_number, trunk_routes, last_message FROM phone_lines WHERE id = ?").get(lineId) as { id: number; status: string; trunk_id: number; trunk_number: string; trunk_routes: number; last_message: string } | undefined;
  if (!line) return { ok: false, certified: false, pending: false, message: "That line was not found." };
  if (line.status === "trunk_live" || line.status === "trunk_done") return { ok: true, certified: true, pending: false, message: line.last_message || "This trunk is already certified." };
  if (!line.trunk_id) return { ok: false, certified: false, pending: false, message: "Save the 3CX trunk before it can be certified." };
  if (line.trunk_routes !== 1) return { ok: false, certified: false, pending: false, message: "The inbound route, the outbound rule assigned to the department, and the department limit are not all saved yet." };
  const detail = await pbxRequest(`Trunks(${line.trunk_id})?$select=Id,Number,IsOnline,IsRegistered`);
  const identity = readTrunkIdentity(detail.ok ? detail.body : null);
  const verdict = trunkProvisionVerdict({
    registered: Boolean(detail.ok && identity.registered),
    inbound: true,
    outbound: true,
    outboundAssigned: true,
    departmentLimited: true,
  });
  const trunkNumber = identity.number || line.trunk_number || "";
  const extra = adminNote.trim();
  if (!verdict.complete) {
    const note = redactProvisioning(`3CX trunk id ${line.trunk_id}${trunkNumber ? `, internal number ${trunkNumber}` : ""} is saved. ${detail.ok ? verdict.reason : detail.message || verdict.reason}`, []).slice(0, 2000);
    getDb().prepare("UPDATE phone_lines SET trunk_number = ?, status = 'trunk_waiting', last_message = ? WHERE id = ?").run(trunkNumber, note, line.id);
    return { ok: false, certified: false, pending: true, message: note };
  }
  const note = [`3CX trunk id ${line.trunk_id}${trunkNumber ? `, internal number ${trunkNumber}` : ""} is registered. The department, default route, inbound route, and outbound rule are saved. No call was placed.`, extra].filter(Boolean).join(" ").slice(0, 2000);
  getDb().prepare("UPDATE phone_lines SET trunk_number = ?, status = 'trunk_live', last_message = ? WHERE id = ?").run(trunkNumber, note, line.id);
  getDb().prepare("UPDATE trunk_tasks SET status = 'done', note = ? WHERE line_id = ?").run(note, line.id);
  return { ok: true, certified: true, pending: false, message: note };
}

export async function confirmTrunkCalls(lineId: number) {
  const result = await certifyTrunk(lineId);
  return { ok: result.ok, message: result.message };
}

export async function markTrunkDone(lineId: number, note: string, trunkId = 0) {
  const line = getDb().prepare("SELECT id, trunk_id FROM phone_lines WHERE id = ?").get(lineId) as { id: number; trunk_id: number } | undefined;
  if (!line) return { ok: false, message: "That line was not found." };
  if (trunkId > 0 && trunkId !== line.trunk_id) getDb().prepare("UPDATE phone_lines SET trunk_id = ? WHERE id = ?").run(trunkId, lineId);
  const result = await certifyTrunk(lineId, note);
  return { ok: result.certified, message: result.message };
}

export async function linkManualTrunk(lineId: number, trunkId: number) {
  const line = getDb().prepare("SELECT * FROM phone_lines WHERE id = ?").get(lineId) as Line | undefined;
  if (!line) return { ok: false, message: "That line was not found." };
  if (!Number.isInteger(trunkId) || trunkId < 1) return { ok: false, message: "Enter the trunk id shown in 3CX." };
  const saved = await pbxRequest(`Trunks(${trunkId})?$select=Id`);
  if (!saved.ok) return { ok: false, message: saved.message || "3CX does not have a trunk with that id." };
  getDb().prepare("UPDATE phone_lines SET trunk_id = ?, status = 'trunk_waiting', last_message = ? WHERE id = ?").run(trunkId, "The trunk id was read from 3CX. Inbound and outbound are still being checked.", line.id);
  return attachTrunk(line.id);
}

export function ensureCustomerLine(userId: number, requestId: number, did: string) {
  const ref = carrierDidRef(did);
  const ten = ref.startsWith("voipms:") ? ref.slice("voipms:".length) : "";
  if (!ten || !requestId) return 0;
  const database = getDb();
  const byRequest = database.prepare("SELECT id, status FROM phone_lines WHERE request_id = ?").get(requestId) as { id: number; status: string } | undefined;
  if (byRequest) {
    if (byRequest.status === "not_on_carrier") {
      database.prepare("UPDATE phone_lines SET user_id = ?, did = ?, status = 'ordered', last_message = ? WHERE id = ?").run(userId, ten, "This number is on the phone-company account.", byRequest.id);
    }
    return byRequest.id;
  }
  const byDid = database.prepare("SELECT id, status FROM phone_lines WHERE user_id = ? AND did = ?").get(userId, ten) as { id: number; status: string } | undefined;
  if (byDid) {
    if (byDid.status === "not_on_carrier") {
      database.prepare("UPDATE phone_lines SET status = 'ordered', last_message = ? WHERE id = ?").run("This number is on the phone-company account.", byDid.id);
    }
    return byDid.id;
  }
  const info = database.prepare(
    "INSERT INTO phone_lines (user_id, request_id, did, status, trunk_id, last_message, created_at) VALUES (?, ?, ?, 'ordered', 0, '', ?)",
  ).run(userId, requestId, ten, new Date().toISOString());
  return Number(info.lastInsertRowid);
}

type TrunkLineState = { id: number; user_id: number; did: string; status: string; trunk_id: number; trunk_attempts: number; last_message: string };

function readTrunkLine(lineId: number) {
  return getDb().prepare("SELECT id, user_id, did, status, trunk_id, trunk_attempts, last_message FROM phone_lines WHERE id = ?").get(lineId) as TrunkLineState | undefined;
}

function stopAutomaticTrunk(line: TrunkLineState) {
  if (line.trunk_id || line.trunk_attempts < 3) return line.last_message;
  const note = automaticStopNote(line.last_message);
  if (note !== line.last_message) getDb().prepare("UPDATE phone_lines SET last_message = ? WHERE id = ?").run(note, line.id);
  return note;
}

async function ensureLineAccount(line: TrunkLineState) {
  if (getSubaccount(line.user_id)) return;
  const client = await ensureVoipClient(line.user_id);
  if (!client.ok) return;
  await ensureSubaccount(line.user_id, client.clientId, line.did);
}

export async function retryTrunkLine(lineId: number) {
  const line = readTrunkLine(lineId);
  if (!line) return { ok: false, message: "That line was not found." };
  await ensureLineAccount(line);
  return attachTrunk(lineId);
}

export async function runAutomaticTrunk(lineId: number) {
  let line = readTrunkLine(lineId);
  if (!line) return { ok: false, message: "That line was not found." };
  if ((line.status === "trunk_live" || line.status === "trunk_done") && line.trunk_id) return { ok: true, message: line.last_message || "This number is already a trunk on the phone system." };
  if (line.status === "not_on_carrier") return { ok: false, message: "Not on the phone company" };
  await ensureLineAccount(line);
  if (line.trunk_id) return attachTrunk(lineId);
  let result = { ok: false, message: line.last_message || "The trunk has not been added." };
  while (trunkMayAutoTry(line.trunk_attempts) && !line.trunk_id && line.status !== "trunk_live" && line.status !== "trunk_done" && line.status !== "not_on_carrier") {
    const claimed = getDb().prepare(
      "UPDATE phone_lines SET trunk_attempts = trunk_attempts + 1 WHERE id = ? AND trunk_attempts < 3 AND trunk_id = 0 AND status NOT IN ('trunk_live', 'trunk_done', 'not_on_carrier')",
    ).run(lineId);
    if (claimed.changes !== 1) break;
    result = await attachTrunk(lineId);
    line = readTrunkLine(lineId);
    if (!line) return result;
    if (line.trunk_id) return result;
  }
  line = readTrunkLine(lineId);
  if (!line) return result;
  if (!line.trunk_id && line.trunk_attempts >= 3) return { ok: false, message: stopAutomaticTrunk(line) };
  return result;
}

export function trunkLinesToTry(userId = 0) {
  const sql = userId
    ? "SELECT id FROM phone_lines WHERE user_id = ? AND trunk_id = 0 AND trunk_attempts < 3 AND status NOT IN ('trunk_live', 'trunk_done', 'not_on_carrier') ORDER BY id"
    : "SELECT id FROM phone_lines WHERE trunk_id = 0 AND trunk_attempts < 3 AND status NOT IN ('trunk_live', 'trunk_done', 'not_on_carrier') ORDER BY id";
  return (userId ? getDb().prepare(sql).all(userId) : getDb().prepare(sql).all()) as { id: number }[];
}

export function startTrunks(lineIds: number[]) {
  const ids = [...new Set(lineIds.filter((id) => id > 0))];
  if (!ids.length) return;
  finishAfterResponse(async () => {
    for (const id of ids) await runAutomaticTrunk(id);
  });
}

export function trunksAwaitingRegistration(userId = 0) {
  const sql = userId
    ? "SELECT id FROM phone_lines WHERE user_id = ? AND trunk_id > 0 AND trunk_routes = 1 AND status = 'trunk_waiting'"
    : "SELECT id FROM phone_lines WHERE trunk_id > 0 AND trunk_routes = 1 AND status = 'trunk_waiting'";
  return (userId ? getDb().prepare(sql).all(userId) : getDb().prepare(sql).all()) as { id: number }[];
}

export function scheduleRegistrationChecks(lineIds: number[]) {
  const ids = [...new Set(lineIds.filter((id) => id > 0))];
  if (!ids.length) return;
  finishAfterResponse(async () => {
    for (const id of ids) {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const result = await certifyTrunk(id);
        if (result.certified || !result.pending) break;
        if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 20000));
      }
    }
  });
}

export function scheduleAutomaticTrunks(userId = 0) {
  startTrunks(trunkLinesToTry(userId).map((line) => line.id));
  scheduleRegistrationChecks(trunksAwaitingRegistration(userId).map((line) => line.id));
}

export function publishBoughtNumbers(userId: number) {
  const rows = getDb().prepare("SELECT id, payload, status, provider_ref FROM account_requests WHERE user_id = ? AND kind = 'number' AND status IN ('ordered', 'completed')").all(userId) as { id: number; payload: string; status: string; provider_ref: string }[];
  for (const row of rows) {
    let did = "";
    try {
      did = String((JSON.parse(row.payload) as { did?: string }).did || "");
    } catch {
      did = "";
    }
    if (!numberIsBought(row.status, row.provider_ref, did)) continue;
    ensureCustomerLine(userId, row.id, did);
  }
}

export function publishAllBoughtNumbers() {
  const rows = getDb().prepare("SELECT DISTINCT user_id FROM account_requests WHERE kind = 'number' AND status IN ('ordered', 'completed')").all() as { user_id: number }[];
  for (const row of rows) publishBoughtNumbers(row.user_id);
}

function requestForOwnedDid(userId: number, did: string, sourceRequestId: number) {
  const ref = carrierDidRef(did);
  const ten = ref.startsWith("voipms:") ? ref.slice("voipms:".length) : "";
  if (!ten) return 0;
  const database = getDb();
  const byDid = database.prepare("SELECT request_id FROM phone_lines WHERE user_id = ? AND did = ?").get(userId, ten) as { request_id: number } | undefined;
  if (byDid?.request_id) return byDid.request_id;
  const byRef = database.prepare("SELECT id FROM account_requests WHERE user_id = ? AND kind = 'number' AND provider_ref = ? ORDER BY id DESC LIMIT 1").get(userId, ref) as { id: number } | undefined;
  if (byRef) return byRef.id;
  const source = database.prepare("SELECT id, kind FROM account_requests WHERE id = ? AND user_id = ?").get(sourceRequestId, userId) as { id: number; kind: string } | undefined;
  const sourceUsed = database.prepare("SELECT id FROM phone_lines WHERE request_id = ?").get(sourceRequestId);
  if (source?.kind === "number" && !sourceUsed) {
    database.prepare("UPDATE account_requests SET status = 'ordered', provider_ref = ? WHERE id = ?").run(ref, source.id);
    return source.id;
  }
  const info = database.prepare(
    "INSERT INTO account_requests (user_id, kind, payload, status, provider_ref, staff_note, created_at) VALUES (?, 'number', ?, 'ordered', ?, '', ?)",
  ).run(userId, JSON.stringify({ did: ten }), ref, new Date().toISOString());
  return Number(info.lastInsertRowid);
}

export async function connectOwnedNumbers(userId: number, sourceRequestId: number, dids: string[]) {
  const lineIds: number[] = [];
  const waiting: string[] = [];
  for (const did of portNumbers(dids.join(","))) {
    const owned = await lookupOwnedDid(did);
    if (!owned.ok || !owned.owned) {
      waiting.push(did);
      continue;
    }
    const requestId = requestForOwnedDid(userId, did, sourceRequestId);
    const lineId = ensureCustomerLine(userId, requestId, did);
    if (lineId) lineIds.push(lineId);
  }
  return { lineIds, waiting };
}

export async function reportTrunkCheck(lineId: number) {
  const read = await readTrunkCheck(lineId);
  if (!read.ok) return read;
  return { ok: true, message: `Test only. Nothing was changed. ${read.note}`.slice(0, 1800) };
}

async function readTrunkCheck(lineId: number) {
  const line = getDb().prepare("SELECT * FROM phone_lines WHERE id = ?").get(lineId) as (Line & { trunk_department: number; trunk_rule_group: number; route_label: string }) | undefined;
  if (!line) return { ok: false as const, message: "That line was not found." };
  if (!line.trunk_id) return { ok: false as const, message: "Save the 3CX trunk before checking routes." };
  const department = getDb().prepare("SELECT name, xapi_id, number_from, number_to FROM pbx_departments WHERE user_id = ?").get(line.user_id) as { name: string; xapi_id: number; number_from: string; number_to: string } | undefined;
  const route = savedDefaultRoute(line.user_id);
  const span = department?.number_from && department.number_to ? { from: department.number_from, to: department.number_to } : extensionSpan(line.user_id);
  const detail = await pbxRequest(`Trunks(${line.trunk_id})?$select=Id,Number,IsOnline,Groups,RoutingRules`);
  const identity = readTrunkIdentity(detail.ok ? detail.body : null);
  const inbound = await pbxRequest("InboundRules?$top=100");
  const outbound = await pbxRequest("OutboundRules?$top=100");
  const inboundFound = (inbound.ok && inboundRuleFound(inbound.body, line.trunk_id, line.did)) || (detail.ok && inboundRuleFound(detail.body, line.trunk_id, line.did));
  const outboundFound = outbound.ok && outboundRuleFound(outbound.body, line.trunk_id, span.from, span.to);
  const assigned = Boolean(outbound.ok && department?.xapi_id && outboundAssignedToDepartment(outbound.body, line.trunk_id, span.from, span.to, department.xapi_id));
  const limit = detail.ok && department?.xapi_id ? trunkDepartmentLimit(detail.body, department.xapi_id) : "unknown";
  const departmentLimited = limit === "yes" || (limit === "unknown" && line.trunk_department === 1);
  const outboundAssigned = outbound.ok ? assigned : line.trunk_rule_group === 1;
  const routeLabel = route.label || line.route_label;
  const registered = Boolean(detail.ok && identity.registered);
  const readDetail = [
    detail.ok ? (registered ? `3CX trunk ${line.trunk_id} is registered.` : `3CX trunk ${line.trunk_id} is not registered.`) : `3CX did not confirm trunk ${line.trunk_id}. ${detail.message}`,
    inbound.ok || detail.ok ? (inboundFound ? "The inbound route was read from 3CX." : "3CX did not return an inbound route for this number.") : `Inbound rules could not be read. ${inbound.message}`,
    outbound.ok ? (outboundFound ? `The outbound rule for extensions ${span.from}–${span.to} was read from 3CX.` : "3CX did not return an outbound rule for this trunk and extension range.") : `Outbound rules could not be read. ${outbound.message}`,
    "No call was placed.",
  ].join(" ");
  const note = redactProvisioning(trunkStatusNote({
    trunkId: line.trunk_id,
    trunkNumber: identity.number || line.trunk_number || "",
    departmentName: department?.name || departmentName(line.user_id),
    departmentOnPbx: Boolean(department?.xapi_id),
    extension: route.extensionNumber || extensionFor(line.user_id),
    extensionOnPbx: route.extensionOnPbx,
    routeLabel,
    routeOnPbx: route.onPbx,
    inboundOnPbx: inboundFound,
    outboundOnPbx: outboundFound,
    outboundAssigned,
    departmentLimited,
    from: span.from,
    to: span.to,
    account: "",
    host: "",
    detail: readDetail,
  }), []);
  return {
    ok: true as const,
    line,
    note,
    registered,
    inboundFound,
    outboundFound,
    outboundAssigned,
    departmentLimited,
    routeLabel,
    trunkNumber: identity.number || line.trunk_number || "",
  };
}

export async function checkTrunkRouting(lineId: number) {
  const read = await readTrunkCheck(lineId);
  if (!read.ok) return read;
  const { line, note, registered, inboundFound, outboundFound, outboundAssigned, departmentLimited, routeLabel, trunkNumber } = read;
  if (line.status === "trunk_live" || line.status === "trunk_done") {
    getDb().prepare("UPDATE phone_lines SET trunk_number = ?, trunk_inbound = ?, trunk_outbound = ?, trunk_department = ?, trunk_rule_group = ?, route_label = ?, last_message = ? WHERE id = ?").run(
      trunkNumber,
      inboundFound ? 1 : 0,
      outboundFound ? 1 : 0,
      departmentLimited ? 1 : 0,
      outboundAssigned ? 1 : 0,
      routeLabel.slice(0, 120),
      note,
      line.id,
    );
    return { ok: true, message: note };
  }
  saveTrunkState(line.id, {
    trunkId: line.trunk_id,
    trunkNumber,
    inbound: inboundFound,
    outbound: outboundFound,
    departmentLimited,
    ruleGroup: outboundAssigned,
    routeLabel,
    note,
    registered,
  });
  const routesReady = inboundFound && outboundFound && outboundAssigned && departmentLimited;
  if (routesReady && !registered) scheduleRegistrationChecks([line.id]);
  return { ok: routesReady, message: note };
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
    const sub = await ensureSubaccount(input.userId, client.clientId, input.did);
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
      if (!ordered.ok && orderTimedOut(ordered.message)) {
        const again = await lookupOwnedDid(input.did);
        tries.push(`getDIDsInfo after a slow order ${input.did}: ${again.ok ? (again.owned ? "owned" : "not listed") : again.message}`);
        if (again.ok && again.owned) {
          ordered = { ...ordered, ok: true, message: "The number is on the phone-company account." };
          chargedOnOrder = true;
        }
      }
      if (!ordered.ok) return stop("The phone company did not buy this number. The balance and line account need another look.", tries.join(" | "));
      sent = true;
    } else {
      sent = true;
    }
    const lineId = ensureCustomerLine(input.userId, input.requestId, input.did);
    if (!lineId) return stop("The number was bought, but it could not be added to this account.", `No phone line was saved for ${input.did}.`);
    const linked = await billDidToClient(input.did, sub.account, fees, chargedOnOrder);
    if (linked) {
      recordFailure({ area: "number", userId: input.userId, subject: input.did, detail: `connectDID ${input.did} to ${sub.account} returned ${linked}.` });
    }
    const confirmed = await lookupOwnedDid(input.did);
    const userId = input.userId;
    await runAutomaticTrunk(lineId);
    await enforceUser(userId);
    const { sendEmergency } = await import("./e911");
    await sendEmergency(lineId);
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
