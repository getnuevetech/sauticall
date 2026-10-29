import { agentSettings, buildReceptionist, companyFactsFrom, type CompanyFacts } from "./ai-prompt";
import { receptionistCreateBody, receptionistPatchBody } from "./ai-prompt";
import { pbxRequest } from "./carriers";
import { flagOn, getDb } from "./db";
import { recordFailure } from "./failure-log";
import { allocateExtension, appPassword, paidPlan, updateRouting } from "./pbx";
import { idFromPbx } from "./pbx-id";
import { numberAlreadyUsed } from "./pbx-access";
import { planAllows } from "./plan-features";

type Stored = {
  user_id: number;
  xapi_id: number;
  number: string;
  email: string;
  access_password: string;
  extra: string;
  enabled: number;
  status: string;
  last_message: string;
};

type Department = { name: string; xapi_id: number; open_time: string; close_time: string };

function receptionistEmail(userId: number) {
  return `receptionist-${userId}@sauticall.invalid`;
}

export function readCompanyFacts(userId: number, extra = ""): CompanyFacts {
  const database = getDb();
  const department = database.prepare("SELECT name, xapi_id, open_time, close_time FROM pbx_departments WHERE user_id = ?").get(userId) as Department | undefined;
  const address = database.prepare("SELECT street_number, street_name, city, state, zip FROM emergency_addresses WHERE user_id = ?").get(userId) as
    | { street_number: string; street_name: string; city: string; state: string; zip: string }
    | undefined;
  const lines = database.prepare("SELECT did FROM phone_lines WHERE user_id = ? AND did != '' AND status != 'not_on_carrier'").all(userId) as { did: string }[];
  const people = database.prepare(
    "SELECT first_name, last_name, number, xapi_id, status FROM pbx_extensions WHERE user_id = ? AND status != 'removed' ORDER BY number",
  ).all(userId) as { first_name: string; last_name: string; number: string; xapi_id: number; status: string }[];
  const groups = database.prepare("SELECT name, kind, number, xapi_id FROM call_groups WHERE user_id = ? ORDER BY kind, name").all(userId) as
    { name: string; kind: string; number: string; xapi_id: number }[];
  const street = [address?.street_number, address?.street_name].filter(Boolean).join(" ");
  const place = [address?.city, address?.state, address?.zip].filter(Boolean).join(" ");
  return companyFactsFrom({
    company: department?.name || "",
    open: department?.open_time || "",
    close: department?.close_time || "",
    address: [street, place].filter(Boolean).join(", "),
    numbers: lines.map((line) => line.did),
    people: people.map((person) => ({
      name: `${person.first_name} ${person.last_name}`.trim(),
      number: person.number,
      live: person.xapi_id !== 0 && person.status === "created",
    })),
    groups: groups.map((group) => ({
      name: group.name,
      kind: group.kind === "queue" ? "queue" : "ring",
      number: group.number,
      live: group.xapi_id !== 0,
    })),
    anyLanguage: planAllows(paidPlan(userId), "ai_any_language"),
    extra,
  });
}

export function receptionistView(userId: number) {
  const row = getDb().prepare("SELECT extra, enabled, status, last_message, number, xapi_id FROM ai_receptionists WHERE user_id = ?").get(userId) as
    | { extra: string; enabled: number; status: string; last_message: string; number: string; xapi_id: number }
    | undefined;
  const facts = readCompanyFacts(userId, row?.extra || "");
  const script = buildReceptionist(facts);
  return {
    facts,
    script,
    enabled: row ? row.enabled === 1 : true,
    status: row?.status || "",
    message: row?.last_message || "",
    number: row?.number || "",
    onPhoneSystem: Boolean(row?.xapi_id),
  };
}

function loadRow(userId: number) {
  return getDb().prepare("SELECT * FROM ai_receptionists WHERE user_id = ?").get(userId) as Stored | undefined;
}

function saveRow(userId: number, row: Partial<Stored> & { status: string; last_message: string; enabled: number; extra: string }) {
  const current = loadRow(userId);
  getDb().prepare(
    `INSERT INTO ai_receptionists (user_id, xapi_id, number, email, access_password, extra, enabled, status, last_message, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       xapi_id = excluded.xapi_id,
       number = excluded.number,
       email = excluded.email,
       access_password = excluded.access_password,
       extra = excluded.extra,
       enabled = excluded.enabled,
       status = excluded.status,
       last_message = excluded.last_message,
       updated_at = excluded.updated_at`,
  ).run(
    userId,
    row.xapi_id ?? current?.xapi_id ?? 0,
    row.number ?? current?.number ?? "",
    row.email ?? current?.email ?? receptionistEmail(userId),
    row.access_password ?? current?.access_password ?? "",
    row.extra,
    row.enabled,
    row.status,
    row.last_message.slice(0, 1200),
    new Date().toISOString(),
  );
}

function takenNumbers() {
  const database = getDb();
  return [
    ...(database.prepare("SELECT number FROM pbx_extensions WHERE status != 'removed'").all() as { number: string }[]),
    ...(database.prepare("SELECT number FROM call_groups").all() as { number: string }[]),
    ...(database.prepare("SELECT number FROM ai_receptionists WHERE number != ''").all() as { number: string }[]),
  ].map((item) => item.number);
}

async function findUserByNumber(number: string) {
  const found = await pbxRequest(`Users?$filter=${encodeURIComponent(`Number eq '${number}'`)}&$select=Id,Number,EmailAddress`);
  if (!found.ok || !found.body || typeof found.body !== "object" || !Array.isArray((found.body as { value?: unknown }).value)) {
    return { ok: found.ok, user: null as { id: number; email: string } | null };
  }
  const match = (found.body as { value: { Number?: string | number; EmailAddress?: string }[] }).value.find((item) => String(item.Number ?? "") === number);
  if (!match) return { ok: true, user: null };
  return { ok: true, user: { id: idFromPbx(match), email: String(match.EmailAddress || "") } };
}

async function pushAgent(userId: number, groupId: number, facts: CompanyFacts) {
  const settings = agentSettings(facts);
  let row = loadRow(userId);
  const email = row?.email || receptionistEmail(userId);
  const password = row?.access_password || appPassword();
  saveRow(userId, { status: row?.status || "waiting", last_message: row?.last_message || "", enabled: 1, extra: facts.extra, email, access_password: password });
  row = loadRow(userId);
  let xapiId = row?.xapi_id || 0;
  let number = row?.number || "";
  let createdHere = false;
  if (xapiId) {
    const patched = await pbxRequest(`Users(${xapiId})`, { method: "PATCH", body: receptionistPatchBody({ id: xapiId, company: facts.company, groupId, settings }) });
    if (patched.ok) {
      saveRow(userId, { xapi_id: xapiId, number, email, access_password: password, extra: facts.extra, enabled: 1, status: "created", last_message: "The receptionist is on the phone system. Open-hours calls go to it." });
      return;
    }
    if (patched.status !== 404) throw new Error(patched.message || "The phone system did not update the receptionist.");
    xapiId = 0;
  }
  for (let attempt = 0; attempt < 5 && !xapiId; attempt += 1) {
    if (!number) {
      const allocated = await allocateExtension(userId, takenNumbers());
      if (!allocated.ok || !allocated.number) throw new Error(allocated.message || "The receptionist needs a free extension in this company.");
      number = allocated.number;
      saveRow(userId, { number, email, access_password: password, extra: facts.extra, enabled: 1, status: "waiting", last_message: "" });
    }
    const lookup = await findUserByNumber(number);
    if (lookup.user && lookup.user.email.toLowerCase() === email.toLowerCase() && lookup.user.id) {
      xapiId = lookup.user.id;
      break;
    }
    if (lookup.user) {
      number = "";
      continue;
    }
    const created = await pbxRequest("Users", {
      method: "POST",
      body: receptionistCreateBody({ company: facts.company, email, number, password, groupId, settings }),
    });
    if (created.ok) {
      createdHere = true;
      xapiId = idFromPbx(created.body, created.location);
      if (!xapiId) {
        const found = await findUserByNumber(number);
        if (found.user?.email.toLowerCase() === email.toLowerCase()) xapiId = found.user.id;
      }
      if (!xapiId) throw new Error("The phone system did not return the receptionist.");
      break;
    }
    const detail = `${"detail" in created ? created.detail || "" : ""} ${created.message || ""}`;
    const code = "code" in created ? created.code || "" : "";
    if (!numberAlreadyUsed(code, detail, created.status)) throw new Error(created.message || "The phone system did not create the receptionist.");
    number = "";
  }
  if (!xapiId) throw new Error("The receptionist needs a free extension in this company.");
  const assigned = await pbxRequest(`Users(${xapiId})`, {
    method: "PATCH",
    body: receptionistPatchBody({ id: xapiId, company: facts.company, groupId, settings }),
  });
  if (!assigned.ok) {
    if (createdHere) {
      const deleted = await pbxRequest(`Users(${xapiId})`, { method: "DELETE" });
      if (!deleted.ok && deleted.status !== 404) {
        recordFailure({ area: "ai", userId, subject: number, detail: `${assigned.message || ""} ${deleted.message || ""}`.trim() });
      }
    }
    throw new Error(assigned.message || "The phone system did not place the receptionist on the company department.");
  }
  saveRow(userId, {
    xapi_id: xapiId,
    number,
    email,
    access_password: password,
    extra: facts.extra,
    enabled: 1,
    status: "created",
    last_message: "The receptionist is on the phone system. Open-hours calls go to it.",
  });
}

export async function saveReceptionist(userId: number, input: { extra: string; answer: boolean }) {
  const facts = readCompanyFacts(userId, input.extra);
  const built = buildReceptionist(facts);
  if (built.missing) return { ok: false as const, message: built.missing };
  if (!planAllows(paidPlan(userId), "ai")) return { ok: false as const, message: "An administrator has to check AI receptionist on your plan before this account can use it." };
  const department = getDb().prepare("SELECT name, xapi_id, open_time, close_time FROM pbx_departments WHERE user_id = ?").get(userId) as Department | undefined;
  const current = loadRow(userId);
  if (!input.answer) {
    saveRow(userId, { extra: facts.extra, enabled: 0, status: current?.xapi_id ? current.status : "saved", last_message: "Saved. Incoming calls stay on the current routing." });
    if (current?.xapi_id && flagOn("pbx.live_provision")) {
      const settings = agentSettings(facts);
      const patched = await pbxRequest(`Users(${current.xapi_id})`, {
        method: "PATCH",
        body: receptionistPatchBody({ id: current.xapi_id, company: facts.company, groupId: department?.xapi_id || undefined, settings }),
      });
      if (!patched.ok && patched.status !== 404) {
        recordFailure({ area: "ai", userId, subject: current.number, detail: patched.message || "The receptionist prompt was not updated." });
        return { ok: false as const, message: "The receptionist was saved here. The phone system did not update the prompt." };
      }
    }
    if (current?.xapi_id) await updateRouting(userId);
    return { ok: true as const, message: "Saved. Incoming calls stay on the current routing." };
  }
  if (!flagOn("pbx.live_provision")) {
    saveRow(userId, { extra: facts.extra, enabled: 1, status: "saved", last_message: "Creating people on the phone system is turned off." });
    return { ok: false as const, message: "Creating people on the phone system is turned off." };
  }
  if (!department?.xapi_id) return { ok: false as const, message: "Save the company name on the phone system before the receptionist can answer calls." };
  try {
    await pushAgent(userId, department.xapi_id, facts);
    await updateRouting(userId);
    return { ok: true as const, message: "The receptionist is on the phone system." };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "The phone system did not save the receptionist.";
    saveRow(userId, { extra: facts.extra, enabled: 1, status: "failed", last_message: detail });
    recordFailure({ area: "ai", userId, subject: facts.company, detail });
    return { ok: false as const, message: detail };
  }
}
