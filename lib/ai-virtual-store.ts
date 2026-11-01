import { getDb } from "./db";
import { ensureVirtualSchema, liveVirtualRoute } from "./ai-virtual";

export type VirtualAgent = {
  id: number;
  user_id: number;
  name: string;
  agent_type: string;
  execution_engine: string;
  status: string;
  language: string;
  greeting: string;
  instructions: string;
  fallback_label: string;
  did: string;
  prompt_sync: string;
  config_revision: number;
  client_id: string;
  native_agent_id: string;
  route_target: string;
  binding_status: string;
  previous_route: string;
  assignment_state: string;
};

const AGENT_SQL = `
  SELECT a.id, a.user_id, a.name, a.agent_type, a.execution_engine, a.status, a.language, a.greeting, a.instructions,
         a.fallback_label, a.did, a.prompt_sync, a.config_revision,
         COALESCE(b.client_id, '') AS client_id, COALESCE(b.native_agent_id, '') AS native_agent_id,
         COALESCE(b.route_target, '') AS route_target, COALESCE(b.binding_status, '') AS binding_status,
         COALESCE(d.previous_route, '') AS previous_route, COALESCE(d.state, '') AS assignment_state
  FROM ai_agents a
  LEFT JOIN ai_3cx_bindings b ON b.agent_id = a.id
  LEFT JOIN ai_did_assignments d ON d.agent_id = a.id
`;

export function listAccountAgents(userId: number) {
  return getDb().prepare(`${AGENT_SQL} WHERE a.user_id = ? ORDER BY a.id DESC`).all(userId) as VirtualAgent[];
}

export function listAllAgents() {
  return getDb().prepare(`${AGENT_SQL} ORDER BY a.id DESC`).all() as VirtualAgent[];
}

export function accountAgent(userId: number, agentId: number) {
  return getDb().prepare(`${AGENT_SQL} WHERE a.user_id = ? AND a.id = ?`).get(userId, agentId) as VirtualAgent | undefined;
}

export function certifiedVirtualRoute(userId: number) {
  const row = getDb().prepare(
    "SELECT binding_status AS status, route_target AS routeTarget FROM ai_3cx_bindings b JOIN ai_agents a ON a.id = b.agent_id WHERE a.user_id = ? AND b.binding_status = 'ACTIVE' AND b.route_target != '' ORDER BY a.id LIMIT 1",
  ).get(userId) as { status: string; routeTarget: string } | undefined;
  return liveVirtualRoute(row ? { status: row.status, routeTarget: row.routeTarget, label: `AI virtual destination ${row.routeTarget}` } : null);
}

export function listCapabilities() {
  ensureVirtualSchema(getDb());
  return getDb().prepare("SELECT capability, status, observed_build, verified_at, evidence FROM pbx_capabilities ORDER BY capability").all() as {
    capability: string;
    status: string;
    observed_build: string;
    verified_at: string;
    evidence: string;
  }[];
}

export function listManualTasks() {
  return getDb().prepare(
    `SELECT t.id, t.job_id, t.user_id, t.agent_id, t.required_action, t.resource_id, t.note, t.verification_status, t.created_at,
            a.name AS agent_name, a.execution_engine, a.status AS agent_status, u.email
     FROM ai_manual_tasks t
     JOIN ai_agents a ON a.id = t.agent_id
     JOIN users u ON u.id = t.user_id
     ORDER BY t.id DESC`,
  ).all() as {
    id: number;
    job_id: number;
    user_id: number;
    agent_id: number;
    required_action: string;
    resource_id: string;
    note: string;
    verification_status: string;
    created_at: string;
    agent_name: string;
    execution_engine: string;
    agent_status: string;
    email: string;
  }[];
}

export { publishVirtualAgent, recordVirtualBinding, saveVirtualAgent } from "./ai-virtual";
