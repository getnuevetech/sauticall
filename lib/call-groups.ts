import { pbxRequest } from "./carriers";
import { flagOn, getDb } from "./db";
import { nextFreeNumber } from "./group-numbers";
import { idFromPbx } from "./pbx-id";
import { updateRouting } from "./pbx";

export const RING_STRATEGIES = [
  ["ring_all", "Ring everyone at once"],
  ["hunt", "Ring one person at a time"],
] as const;

export const QUEUE_STRATEGIES = [
  ["ring_all", "Ring everyone at once"],
  ["hunt", "Ring one person at a time"],
  ["least_talk", "Whoever has talked the least"],
  ["fewest", "Whoever has answered the fewest calls"],
] as const;

export type CallGroup = {
  id: number;
  user_id: number;
  kind: string;
  name: string;
  number: string;
  strategy: string;
  answers: number;
  xapi_id: number;
  status: string;
  last_message: string;
  created_at: string;
};

type Member = { extension_id: number; number: string; first_name: string; last_name: string; position: number };

export function strategyLabel(kind: string, strategy: string) {
  const list = kind === "queue" ? QUEUE_STRATEGIES : RING_STRATEGIES;
  return list.find((item) => item[0] === strategy)?.[1] || strategy;
}

export function strategyAllowed(kind: string, strategy: string) {
  const list = kind === "queue" ? QUEUE_STRATEGIES : RING_STRATEGIES;
  return list.some((item) => item[0] === strategy);
}

function xapiStrategy(kind: string, strategy: string) {
  if (kind === "queue") {
    if (strategy === "least_talk") return "LeastTalkTime";
    if (strategy === "fewest") return "FewestAnswered";
    if (strategy === "ring_all") return "RingAll";
    return "Hunt";
  }
  return strategy === "hunt" ? "PrioritizedHunt" : "RingAll";
}

export function groupMembers(groupId: number) {
  return getDb()
    .prepare(
      `SELECT m.extension_id, e.number, e.first_name, e.last_name, m.position
       FROM call_group_members m JOIN pbx_extensions e ON e.id = m.extension_id
       WHERE m.group_id = ? ORDER BY m.position, e.number`,
    )
    .all(groupId) as Member[];
}

function memberText(members: Member[]) {
  return members.map((member) => `${member.number} ${member.first_name} ${member.last_name}`).join(", ");
}

function saveTask(group: CallGroup, members: Member[], status: string, note: string) {
  const department = getDb().prepare("SELECT name FROM pbx_departments WHERE user_id = ?").get(group.user_id) as { name: string } | undefined;
  getDb()
    .prepare(
      `INSERT INTO call_group_tasks (group_id, user_id, kind, name, number, strategy, members, department_name, status, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(group_id) DO UPDATE SET kind = excluded.kind, name = excluded.name, number = excluded.number, strategy = excluded.strategy, members = excluded.members, department_name = excluded.department_name, status = excluded.status, note = excluded.note`,
    )
    .run(group.id, group.user_id, group.kind, group.name, group.number, strategyLabel(group.kind, group.strategy), memberText(members), department?.name || `SautiCall ${group.user_id}`, status, note.slice(0, 400), new Date().toISOString());
}

export async function provisionCallGroup(id: number) {
  const database = getDb();
  const group = database.prepare("SELECT * FROM call_groups WHERE id = ?").get(id) as CallGroup | undefined;
  if (!group) return { ok: false, message: "That group was not found." };
  const members = groupMembers(id);
  if (!members.length) return { ok: false, message: "Add at least one person." };
  if (!flagOn("pbx.live_provision")) {
    const message = "Creating people on the phone system is turned off. Build this group on the 3CX server, then mark it done.";
    database.prepare("UPDATE call_groups SET status = 'waiting', last_message = ? WHERE id = ?").run(message, id);
    saveTask(group, members, "open", message);
    return { ok: false, message };
  }
  const path = group.kind === "queue" ? "Queues" : "RingGroups";
  const strategy = xapiStrategy(group.kind, group.strategy);
  const body = group.kind === "queue"
    ? {
        Name: group.name,
        Number: group.number,
        PollingStrategy: strategy,
        MasterTimeout: 180,
        RingTimeout: 20,
        Agents: members.map((member) => ({ Number: member.number, SkillGroup: "1" })),
      }
    : {
        Name: group.name,
        Number: group.number,
        RingStrategy: strategy,
        RingTime: 20,
        Members: members.map((member) => ({ Number: member.number })),
      };
  const created = group.xapi_id
    ? await pbxRequest(`${path}(${group.xapi_id})`, { method: "PATCH", body: { ...body, Id: group.xapi_id } })
    : await pbxRequest(path, { method: "POST", body });
  const xapiId = group.xapi_id || idFromPbx(created.body, created.location);
  if (!created.ok || !xapiId) {
    const message = created.message || "3CX did not create this group.";
    database.prepare("UPDATE call_groups SET status = 'failed', last_message = ? WHERE id = ?").run(message.slice(0, 400), id);
    saveTask({ ...group }, members, "open", message);
    return { ok: false, message };
  }
  database.prepare("UPDATE call_groups SET xapi_id = ?, status = 'created', last_message = ? WHERE id = ?").run(xapiId, "Created on the phone system.", id);
  saveTask(group, members, "done", "Created on the phone system.");
  if (group.answers) await updateRouting(group.user_id);
  return { ok: true, message: "Created on the phone system." };
}

export async function createCallGroup(input: { userId: number; kind: "ring" | "queue"; name: string; strategy: string; extensionIds: number[] }) {
  if (input.kind !== "ring" && input.kind !== "queue") return { ok: false, message: "Choose a ring group or a call queue." };
  const name = input.name.trim().slice(0, 60);
  if (!name) return { ok: false, message: "Give the group a name." };
  if (!strategyAllowed(input.kind, input.strategy)) return { ok: false, message: "Choose how the calls should ring." };
  const ids = [...new Set(input.extensionIds.map((id) => Number(id)).filter((id) => id > 0))];
  if (!ids.length) return { ok: false, message: "Choose at least one person." };
  const database = getDb();
  const count = database.prepare("SELECT COUNT(*) AS n FROM call_groups WHERE user_id = ? AND kind = ?").get(input.userId, input.kind) as { n: number };
  if (count.n >= 10) return { ok: false, message: input.kind === "queue" ? "This account already has 10 call queues." : "This account already has 10 ring groups." };
  const owned = database.prepare(`SELECT id FROM pbx_extensions WHERE user_id = ? AND id IN (${ids.map(() => "?").join(",")})`).all(input.userId, ...ids) as { id: number }[];
  if (owned.length !== ids.length) return { ok: false, message: "Choose people from this account." };
  const used = [
    ...(database.prepare("SELECT number FROM pbx_extensions").all() as { number: string }[]),
    ...(database.prepare("SELECT number FROM call_groups").all() as { number: string }[]),
  ].map((row) => row.number);
  const number = nextFreeNumber(used, input.kind === "queue" ? 900 : 800);
  if (!number) return { ok: false, message: "No free extension number is left for this group." };
  const info = database
    .prepare("INSERT INTO call_groups (user_id, kind, name, number, strategy, answers, status, created_at) VALUES (?, ?, ?, ?, ?, 0, 'waiting', ?)")
    .run(input.userId, input.kind, name, number, input.strategy, new Date().toISOString());
  const groupId = Number(info.lastInsertRowid);
  const insertMember = database.prepare("INSERT INTO call_group_members (group_id, extension_id, position) VALUES (?, ?, ?)");
  ids.forEach((extensionId, index) => insertMember.run(groupId, extensionId, index));
  const result = await provisionCallGroup(groupId);
  return { ok: true, message: result.ok ? result.message : result.message, groupId };
}

export async function setDaytimeGroup(userId: number, groupId: number) {
  const database = getDb();
  const group = groupId
    ? database.prepare("SELECT id, status FROM call_groups WHERE id = ? AND user_id = ?").get(groupId, userId) as { id: number; status: string } | undefined
    : undefined;
  if (groupId && !group) return { ok: false, message: "That group was not found." };
  database.prepare("UPDATE call_groups SET answers = 0 WHERE user_id = ?").run(userId);
  if (group) database.prepare("UPDATE call_groups SET answers = 1 WHERE id = ?").run(group.id);
  if (group && group.status !== "created" && group.status !== "manual") {
    return { ok: true, message: "This group will take daytime calls once it is on the phone system." };
  }
  return updateRouting(userId);
}

export async function removeCallGroup(userId: number, groupId: number) {
  const database = getDb();
  const group = database.prepare("SELECT * FROM call_groups WHERE id = ? AND user_id = ?").get(groupId, userId) as CallGroup | undefined;
  if (!group) return { ok: false, message: "That group was not found." };
  if (group.xapi_id && flagOn("pbx.live_provision")) {
    const path = group.kind === "queue" ? "Queues" : "RingGroups";
    const removed = await pbxRequest(`${path}(${group.xapi_id})`, { method: "DELETE" });
    if (!removed.ok) return { ok: false, message: removed.message };
  }
  const manual = group.status === "manual";
  database.prepare("DELETE FROM call_group_members WHERE group_id = ?").run(groupId);
  database.prepare("DELETE FROM call_group_tasks WHERE group_id = ?").run(groupId);
  database.prepare("DELETE FROM call_groups WHERE id = ?").run(groupId);
  if (group.answers) await updateRouting(userId);
  return { ok: true, message: manual ? "Removed here. If you also built it on the 3CX server, remove it there too." : "Removed." };
}

export async function markGroupDone(groupId: number, note: string) {
  const database = getDb();
  const group = database.prepare("SELECT * FROM call_groups WHERE id = ?").get(groupId) as CallGroup | undefined;
  if (!group) return { ok: false, message: "That group was not found." };
  const text = note.trim().slice(0, 400) || "Built on the 3CX server.";
  database.prepare("UPDATE call_groups SET status = 'manual', last_message = ? WHERE id = ?").run(text, groupId);
  database.prepare("UPDATE call_group_tasks SET status = 'done', note = ? WHERE group_id = ?").run(text, groupId);
  if (group.answers) {
    const routed = await updateRouting(group.user_id);
    if (!routed.ok) return { ok: true, message: `${text} Daytime routing still needs a look: ${routed.message}` };
  }
  return { ok: true, message: text };
}
