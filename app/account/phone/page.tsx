import { PhoneSystem } from "@/components/account/PhoneSystem";
import { guardAccount } from "@/lib/guard";
import { QUEUE_STRATEGIES, RING_STRATEGIES, groupMembers, strategyLabel, type CallGroup } from "@/lib/call-groups";
import { getDb } from "@/lib/db";
import { extensionCapacity, paidPlan } from "@/lib/pbx";
import { planAllows } from "@/lib/plan-features";
import { customerMessage, extensionCustomerMessage } from "@/lib/customer-message";
import { accountNeedsMfa } from "@/lib/mfa";
import { DEPARTMENT_NAME_RULES, shownAccountName } from "@/lib/pbx-user";
import { extensionSetup } from "@/lib/account-display";
import { systemsForPlan } from "@/lib/ai-account";
import { publishBoughtNumbers, scheduleAutomaticTrunks } from "@/lib/lines";
import { scheduleDefaultAccount } from "@/lib/default-account";
import { customerConnectionNote } from "@/lib/trunk-tries";

type Extension = { id: number; number: string; former_number: string; first_name: string; last_name: string; email: string; status: string; welcome_note: string; last_message: string; ai_role: string; ai_name: string };

function extensionNumber(row: Extension) {
  return row.status === "removed" && row.former_number ? row.former_number : row.number;
}

export default async function PhonePage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; note?: string; tab?: string }> }) {
  const user = await guardAccount();
  const params = await searchParams;
  const plan = paidPlan(user.id);
  const limit = plan ? extensionCapacity(plan) : 0;
  const rows = getDb().prepare("SELECT id, number, former_number, first_name, last_name, email, status, welcome_note, last_message, ai_role, ai_name FROM pbx_extensions WHERE user_id = ? ORDER BY number").all(user.id) as Extension[];
  const hours = getDb().prepare("SELECT name, open_time, close_time, last_message FROM pbx_departments WHERE user_id = ?").get(user.id) as { name: string; open_time: string; close_time: string; last_message: string } | undefined;
  const profile = getDb().prepare("SELECT business_name FROM users WHERE id = ?").get(user.id) as { business_name: string } | undefined;
  publishBoughtNumbers(user.id);
  scheduleDefaultAccount(user.id);
  scheduleAutomaticTrunks(user.id);
  const lines = getDb().prepare("SELECT status, trunk_id, trunk_attempts, trunk_routes FROM phone_lines WHERE user_id = ?").all(user.id) as { status: string; trunk_id: number; trunk_attempts: number; trunk_routes: number }[];
  const groups = getDb().prepare("SELECT * FROM call_groups WHERE user_id = ? ORDER BY kind, id").all(user.id) as CallGroup[];
  const saved = params.saved === "department"
    ? "Company name saved. People are added to this department."
    : params.saved === "group"
      ? "The group was saved."
      : params.saved === "hours"
        ? "Business hours saved."
        : params.saved === "removed"
          ? "This person was removed. Their name, email, and extension stay in the record."
          : params.saved === "person"
      ? "The person’s name and email were saved."
      : params.saved
        ? "The person was added."
        : "";
  const note = params.note ? customerMessage(params.note, "") : "";
  const notice = params.error ? customerMessage(params.error, "Something went wrong. Please try again, or contact support.") : [saved, note].filter(Boolean).join(" ");
  return (
    <PhoneSystem
      initialTab={params.tab || "users"}
      company={shownAccountName(hours?.name || "", profile?.business_name || "", user.name)}
      rules={DEPARTMENT_NAME_RULES}
      planName={plan?.name || ""}
      seats={limit}
      limit={limit}
      hasPlan={Boolean(plan)}
      bought={lines.some((line) => line.status !== "not_on_carrier")}
      connected={lines.some((line) => line.status === "trunk_live" || line.status === "trunk_done")}
      connectionStatus={customerConnectionNote(lines.map((line) => ({ status: line.status, trunkId: line.trunk_id, attempts: line.trunk_attempts, routes: line.trunk_routes === 1 })))}
      hoursOpen={hours?.open_time || ""}
      hoursClose={hours?.close_time || ""}
      hoursNote={hours?.last_message ? customerMessage(hours.last_message, "") : ""}
      people={rows.map((row) => ({
        id: row.id,
        number: extensionNumber(row),
        first: row.first_name,
        last: row.last_name,
        email: row.email,
        status: row.status,
        welcome: row.status === "failed" && row.last_message ? extensionCustomerMessage(row.last_message) : row.welcome_note,
        aiRole: row.ai_role,
        aiName: row.ai_name,
      }))}
      aiChoices={systemsForPlan(plan?.features || []).filter((item) => item.included).map((item) => ({ code: item.code, label: item.label }))}
      groups={groups.map((group) => ({
        id: group.id,
        kind: group.kind,
        name: group.name,
        number: group.number,
        strategy: strategyLabel(group.kind, group.strategy),
        answers: Boolean(group.answers),
        status: extensionSetup(group.status).label,
        people: groupMembers(group.id).map((person) => person.first_name).filter(Boolean).join(", "),
      }))}
      ringChoices={RING_STRATEGIES.map(([value, label]) => ({ value, label }))}
      queueChoices={QUEUE_STRATEGIES.map(([value, label]) => ({ value, label }))}
      allowHours={plan ? planAllows(plan, "business_hours") : false}
      allowRings={plan ? planAllows(plan, "ring_groups") : false}
      allowQueues={plan ? planAllows(plan, "queues") : false}
      needsCode={Boolean(user.mfa_secret) || accountNeedsMfa(user)}
      hasAuthenticator={Boolean(user.mfa_secret)}
      notice={notice}
      noticeError={Boolean(params.error)}
    />
  );
}
