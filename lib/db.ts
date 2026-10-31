import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { hashPassword } from "./auth";
import { customerCodeWithoutHyphen } from "./customer-code";
import { upgradeContent } from "./content-upgrade";
import { seedDesk } from "./desk-seed";
import { AI_SWITCHES, DRAFT_NOTIFICATION_AGREEMENT, agreementDigest } from "./ai-system";
import { defaultExtensionPlan } from "./extension-numbers";
import { dataDir } from "./paths";
import {
  defaultFaqs,
  defaultFlags,
  defaultFooter,
  defaultNav,
  defaultPages,
  defaultPersonas,
  defaultMinuteBundles,
  defaultPlans,
  defaultServices,
  defaultTheme,
} from "./seed-data";

let db: Database.Database | null = null;

export function getDb() {
  if (db) return db;
  const dir = dataDir();
  fs.mkdirSync(dir, { recursive: true });
  db = new Database(path.join(dir, "sauticall.sqlite"));
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 2000");
  migrate(db);
  seed(db);
  return db;
}

function migrate(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      key TEXT PRIMARY KEY,
      json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      mfa_secret TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      mfa_pending INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS gateways (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      provider_key TEXT NOT NULL,
      public_label TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0,
      priority INTEGER NOT NULL DEFAULT 100,
      mode TEXT NOT NULL DEFAULT 'test',
      currencies TEXT NOT NULL DEFAULT 'USD',
      config_json TEXT NOT NULL DEFAULT '{}',
      secret_ref TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      alt TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      service TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS payment_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      gateway_id INTEGER NOT NULL,
      amount_cents INTEGER NOT NULL,
      currency TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS account_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS connections (
      provider TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 0,
      public_json TEXT NOT NULL,
      secret TEXT NOT NULL DEFAULT '',
      last_ok INTEGER NOT NULL DEFAULT 0,
      last_message TEXT NOT NULL DEFAULT '',
      checked_at TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS failure_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      area TEXT NOT NULL,
      user_id INTEGER NOT NULL DEFAULT 0,
      subject TEXT NOT NULL,
      detail TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  const cols = database.prepare("PRAGMA table_info(messages)").all() as { name: string }[];
  const names = new Set(cols.map((column) => column.name));
  if (!names.has("phone")) database.exec("ALTER TABLE messages ADD COLUMN phone TEXT NOT NULL DEFAULT ''");
  if (!names.has("company")) database.exec("ALTER TABLE messages ADD COLUMN company TEXT NOT NULL DEFAULT ''");
  if (!names.has("kind")) database.exec("ALTER TABLE messages ADD COLUMN kind TEXT NOT NULL DEFAULT 'contact'");
  const requestCols = database.prepare("PRAGMA table_info(account_requests)").all() as { name: string }[];
  const requestNames = new Set(requestCols.map((column) => column.name));
  if (!requestNames.has("provider_ref")) database.exec("ALTER TABLE account_requests ADD COLUMN provider_ref TEXT NOT NULL DEFAULT ''");
  if (!requestNames.has("staff_note")) database.exec("ALTER TABLE account_requests ADD COLUMN staff_note TEXT NOT NULL DEFAULT ''");
  const gatewayCols = new Set((database.prepare("PRAGMA table_info(gateways)").all() as { name: string }[]).map((column) => column.name));
  if (!gatewayCols.has("secret")) database.exec("ALTER TABLE gateways ADD COLUMN secret TEXT NOT NULL DEFAULT ''");
  if (!gatewayCols.has("last_ok")) database.exec("ALTER TABLE gateways ADD COLUMN last_ok INTEGER NOT NULL DEFAULT 0");
  if (!gatewayCols.has("last_message")) database.exec("ALTER TABLE gateways ADD COLUMN last_message TEXT NOT NULL DEFAULT ''");
  if (!gatewayCols.has("checked_at")) database.exec("ALTER TABLE gateways ADD COLUMN checked_at TEXT NOT NULL DEFAULT ''");
  const paymentCols = new Set((database.prepare("PRAGMA table_info(payment_attempts)").all() as { name: string }[]).map((column) => column.name));
  if (!paymentCols.has("provider_ref")) database.exec("ALTER TABLE payment_attempts ADD COLUMN provider_ref TEXT NOT NULL DEFAULT ''");
  if (!paymentCols.has("checkout_url")) database.exec("ALTER TABLE payment_attempts ADD COLUMN checkout_url TEXT NOT NULL DEFAULT ''");
  if (!paymentCols.has("plan_name")) database.exec("ALTER TABLE payment_attempts ADD COLUMN plan_name TEXT NOT NULL DEFAULT ''");
  if (!paymentCols.has("product_kind")) database.exec("ALTER TABLE payment_attempts ADD COLUMN product_kind TEXT NOT NULL DEFAULT 'plan'");
  if (!paymentCols.has("product_minutes")) database.exec("ALTER TABLE payment_attempts ADD COLUMN product_minutes INTEGER NOT NULL DEFAULT 0");
  if (!paymentCols.has("bundle_name")) database.exec("ALTER TABLE payment_attempts ADD COLUMN bundle_name TEXT NOT NULL DEFAULT ''");
  if (!paymentCols.has("paid_at")) database.exec("ALTER TABLE payment_attempts ADD COLUMN paid_at TEXT NOT NULL DEFAULT ''");
  if (!paymentCols.has("carrier_funded")) database.exec("ALTER TABLE payment_attempts ADD COLUMN carrier_funded INTEGER NOT NULL DEFAULT 0");
  const lineCols = new Set((database.prepare("PRAGMA table_info(phone_lines)").all() as { name: string }[]).map((column) => column.name));
  if (lineCols.size && !lineCols.has("e911_json")) database.exec("ALTER TABLE phone_lines ADD COLUMN e911_json TEXT NOT NULL DEFAULT ''");
  if (lineCols.size && !lineCols.has("e911_status")) database.exec("ALTER TABLE phone_lines ADD COLUMN e911_status TEXT NOT NULL DEFAULT 'missing'");
  if (lineCols.size && !lineCols.has("e911_message")) database.exec("ALTER TABLE phone_lines ADD COLUMN e911_message TEXT NOT NULL DEFAULT ''");
  if (lineCols.size && !lineCols.has("trunk_number")) database.exec("ALTER TABLE phone_lines ADD COLUMN trunk_number TEXT NOT NULL DEFAULT ''");
  if (lineCols.size && !lineCols.has("trunk_routes")) database.exec("ALTER TABLE phone_lines ADD COLUMN trunk_routes INTEGER NOT NULL DEFAULT 0");
  const clientCols = new Set((database.prepare("PRAGMA table_info(voip_clients)").all() as { name: string }[]).map((column) => column.name));
  if (clientCols.size && !clientCols.has("funded_cents")) database.exec("ALTER TABLE voip_clients ADD COLUMN funded_cents INTEGER NOT NULL DEFAULT 0");
  if (clientCols.size && !clientCols.has("funded_plan")) database.exec("ALTER TABLE voip_clients ADD COLUMN funded_plan TEXT NOT NULL DEFAULT ''");
  const subaccountCols = new Set((database.prepare("PRAGMA table_info(voip_subaccounts)").all() as { name: string }[]).map((column) => column.name));
  if (subaccountCols.size && !subaccountCols.has("provider_id")) database.exec("ALTER TABLE voip_subaccounts ADD COLUMN provider_id TEXT NOT NULL DEFAULT ''");
  database.exec(`
    CREATE TABLE IF NOT EXISTS pbx_departments (
      user_id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      xapi_id INTEGER NOT NULL DEFAULT 0,
      number_from TEXT NOT NULL,
      number_to TEXT NOT NULL,
      open_time TEXT NOT NULL DEFAULT '09:00',
      close_time TEXT NOT NULL DEFAULT '17:00',
      last_message TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS pbx_extensions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      number TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT NOT NULL,
      xapi_id INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      access_password TEXT NOT NULL DEFAULT '',
      last_message TEXT NOT NULL DEFAULT '',
      welcome_note TEXT NOT NULL DEFAULT '',
      former_number TEXT NOT NULL DEFAULT '',
      removed_at TEXT NOT NULL DEFAULT '',
      ai_role TEXT NOT NULL DEFAULT '',
      ai_name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      UNIQUE(user_id, number)
    );
    CREATE TABLE IF NOT EXISTS minute_grants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      payment_id INTEGER NOT NULL UNIQUE,
      kind TEXT NOT NULL,
      minutes INTEGER NOT NULL,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cdr_events (
      uniqueid TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      seconds INTEGER NOT NULL,
      destination TEXT NOT NULL DEFAULT '',
      started_at TEXT NOT NULL,
      allocated INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS minute_debits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uniqueid TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      grant_id INTEGER NOT NULL,
      seconds INTEGER NOT NULL,
      UNIQUE(uniqueid, grant_id)
    );
    CREATE TABLE IF NOT EXISTS voip_clients (
      user_id INTEGER PRIMARY KEY,
      client_id TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      password TEXT NOT NULL DEFAULT '',
      last_message TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT '',
      funded_cents INTEGER NOT NULL DEFAULT 0,
      funded_plan TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS voip_subaccounts (
      user_id INTEGER PRIMARY KEY,
      account TEXT NOT NULL,
      username TEXT NOT NULL,
      password TEXT NOT NULL,
      sip_host TEXT NOT NULL DEFAULT '',
      locked INTEGER NOT NULL DEFAULT 0,
      settings_json TEXT NOT NULL DEFAULT '{}',
      last_message TEXT NOT NULL DEFAULT '',
      last_sync TEXT NOT NULL DEFAULT '',
      provider_id TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS phone_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      request_id INTEGER NOT NULL UNIQUE,
      did TEXT NOT NULL,
      status TEXT NOT NULL,
      trunk_id INTEGER NOT NULL DEFAULT 0,
      trunk_number TEXT NOT NULL DEFAULT '',
      trunk_routes INTEGER NOT NULL DEFAULT 0,
      last_message TEXT NOT NULL DEFAULT '',
      e911_json TEXT NOT NULL DEFAULT '',
      e911_status TEXT NOT NULL DEFAULT 'missing',
      e911_message TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS emergency_addresses (
      user_id INTEGER PRIMARY KEY,
      full_name TEXT NOT NULL,
      street_number TEXT NOT NULL,
      street_name TEXT NOT NULL,
      address_type TEXT NOT NULL DEFAULT '',
      address_number TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      country TEXT NOT NULL,
      zip TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'EN',
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS trunk_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      line_id INTEGER NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      did TEXT NOT NULL,
      department_name TEXT NOT NULL,
      extension_number TEXT NOT NULL,
      sip_user TEXT NOT NULL DEFAULT '',
      sip_host TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS access_roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      permissions_json TEXT NOT NULL DEFAULT '[]'
    );
    CREATE TABLE IF NOT EXISTS call_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      number TEXT NOT NULL,
      strategy TEXT NOT NULL,
      answers INTEGER NOT NULL DEFAULT 0,
      xapi_id INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      last_message TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS call_group_members (
      group_id INTEGER NOT NULL,
      extension_id INTEGER NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (group_id, extension_id)
    );
    CREATE TABLE IF NOT EXISTS call_group_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      number TEXT NOT NULL,
      strategy TEXT NOT NULL,
      members TEXT NOT NULL,
      department_name TEXT NOT NULL,
      status TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ticket_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS ticket_group_members (
      group_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      PRIMARY KEY (group_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS ticket_topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      group_id INTEGER NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      requester_email TEXT NOT NULL,
      requester_name TEXT NOT NULL,
      topic_id INTEGER,
      group_id INTEGER,
      subject TEXT NOT NULL,
      status TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'normal',
      assignee_id INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ticket_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      author_id INTEGER,
      author_email TEXT NOT NULL,
      author_name TEXT NOT NULL,
      body TEXT NOT NULL,
      kind TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ticket_mail (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT NOT NULL UNIQUE,
      ticket_id INTEGER NOT NULL,
      direction TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS mail_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      inbound_secret TEXT NOT NULL DEFAULT '',
      smtp_host TEXT NOT NULL DEFAULT '',
      smtp_port INTEGER NOT NULL DEFAULT 587,
      smtp_user TEXT NOT NULL DEFAULT '',
      smtp_pass TEXT NOT NULL DEFAULT '',
      smtp_from TEXT NOT NULL DEFAULT '',
      smtp_secure INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS faq_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      excerpt TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL,
      published INTEGER NOT NULL DEFAULT 0,
      author_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  const userCols = new Set((database.prepare("PRAGMA table_info(users)").all() as { name: string }[]).map((column) => column.name));
  if (!userCols.has("access_role_id")) database.exec("ALTER TABLE users ADD COLUMN access_role_id INTEGER NOT NULL DEFAULT 0");
  if (!userCols.has("disabled")) database.exec("ALTER TABLE users ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0");
  if (!userCols.has("mfa_required")) database.exec("ALTER TABLE users ADD COLUMN mfa_required INTEGER NOT NULL DEFAULT 0");
  if (!userCols.has("phone")) database.exec("ALTER TABLE users ADD COLUMN phone TEXT NOT NULL DEFAULT ''");
  if (!userCols.has("phone_verified_at")) database.exec("ALTER TABLE users ADD COLUMN phone_verified_at TEXT NOT NULL DEFAULT ''");
  if (!userCols.has("email_verified_at")) database.exec("ALTER TABLE users ADD COLUMN email_verified_at TEXT NOT NULL DEFAULT ''");
  if (!userCols.has("terms_accepted_at")) database.exec("ALTER TABLE users ADD COLUMN terms_accepted_at TEXT NOT NULL DEFAULT ''");
  if (!userCols.has("customer_code")) database.exec("ALTER TABLE users ADD COLUMN customer_code TEXT NOT NULL DEFAULT ''");
  database.exec("CREATE UNIQUE INDEX IF NOT EXISTS users_customer_code ON users(customer_code) WHERE customer_code != ''");
  database.exec(`
    CREATE TABLE IF NOT EXISTS recording_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      provider TEXT NOT NULL DEFAULT 'off',
      bucket TEXT NOT NULL DEFAULT '',
      region TEXT NOT NULL DEFAULT '',
      prefix TEXT NOT NULL DEFAULT 'recordings',
      aws_access_key TEXT NOT NULL DEFAULT '',
      aws_secret TEXT NOT NULL DEFAULT '',
      google_email TEXT NOT NULL DEFAULT '',
      google_key TEXT NOT NULL DEFAULT '',
      retention_days INTEGER NOT NULL DEFAULT 365
    );
    INSERT INTO recording_settings (id) VALUES (1) ON CONFLICT(id) DO NOTHING;
    CREATE TABLE IF NOT EXISTS recordings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL DEFAULT 0,
      customer_code TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL DEFAULT 'message',
      object_key TEXT NOT NULL,
      provider TEXT NOT NULL,
      bucket TEXT NOT NULL,
      status TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      byte_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS verification_challenges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      channel TEXT NOT NULL,
      destination TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      salt TEXT NOT NULL DEFAULT '',
      token_hash TEXT NOT NULL DEFAULT '',
      expires_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      used_at TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sms_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      phone TEXT NOT NULL,
      status TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS line_variables (
      key TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      admin_value TEXT NOT NULL DEFAULT '',
      audience TEXT NOT NULL DEFAULT 'admin',
      kind TEXT NOT NULL DEFAULT 'text'
    );
    CREATE TABLE IF NOT EXISTS customer_line_values (
      user_id INTEGER NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (user_id, key)
    );
    CREATE TABLE IF NOT EXISTS ai_switches (
      code TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS ai_engines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      model_name TEXT NOT NULL DEFAULT '',
      endpoint TEXT NOT NULL DEFAULT '',
      secret_ref TEXT NOT NULL DEFAULT '',
      secret TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS ai_assignments (
      function_code TEXT PRIMARY KEY,
      engine_id INTEGER NOT NULL,
      updated_at TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS ai_agreements (
      feature_code TEXT NOT NULL,
      version INTEGER NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      digest TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (feature_code, version)
    );
    CREATE TABLE IF NOT EXISTS ai_acceptances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      feature_code TEXT NOT NULL,
      version INTEGER NOT NULL,
      acks TEXT NOT NULL,
      digest TEXT NOT NULL,
      accepted_at TEXT NOT NULL,
      ip_hash TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS ai_entitlements (
      user_id INTEGER NOT NULL,
      feature_code TEXT NOT NULL,
      admin_grant TEXT NOT NULL DEFAULT 'none',
      customer_enabled INTEGER NOT NULL DEFAULT 0,
      reason TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (user_id, feature_code)
    );
    CREATE TABLE IF NOT EXISTS ai_account_settings (
      user_id INTEGER NOT NULL,
      feature_code TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      greeting TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (user_id, feature_code)
    );
    CREATE TABLE IF NOT EXISTS ai_prompt_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      feature_code TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ai_audio_policy (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      max_seconds INTEGER NOT NULL,
      max_bytes INTEGER NOT NULL,
      retention_days INTEGER NOT NULL,
      preview_enabled INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS ai_voices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      voice_key TEXT NOT NULL,
      engine_id INTEGER,
      rights_ok INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS ai_clips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      script TEXT NOT NULL DEFAULT '',
      voice_id INTEGER,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      digest TEXT NOT NULL,
      mime TEXT NOT NULL,
      byte_count INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL,
      storage_name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ai_notify_policy (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      repeats INTEGER NOT NULL DEFAULT 1,
      promo_enabled INTEGER NOT NULL DEFAULT 0,
      window_start TEXT NOT NULL DEFAULT '',
      window_end TEXT NOT NULL DEFAULT '',
      time_zone TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS ai_notify_purposes (
      code TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      promotional INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS ai_suppressions (
      user_id INTEGER NOT NULL,
      e164 TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, e164)
    );
    CREATE TABLE IF NOT EXISTS ai_campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      purpose_code TEXT NOT NULL,
      business_name TEXT NOT NULL,
      caller_id TEXT NOT NULL,
      clip_id INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ai_recipients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      person_name TEXT NOT NULL DEFAULT '',
      e164 TEXT NOT NULL,
      consent TEXT NOT NULL DEFAULT '',
      outcome TEXT NOT NULL DEFAULT 'pending',
      phase TEXT NOT NULL DEFAULT 'idle',
      repeats_left INTEGER NOT NULL DEFAULT 0,
      content_played INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ai_listen_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient_id INTEGER NOT NULL,
      event TEXT NOT NULL,
      outcome TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ai_outbound_routes (
      user_id INTEGER PRIMARY KEY,
      extension_number TEXT NOT NULL DEFAULT '',
      trunk_id INTEGER NOT NULL DEFAULT 0,
      caller_id TEXT NOT NULL DEFAULT '',
      scope TEXT NOT NULL DEFAULT '',
      primary_status TEXT NOT NULL DEFAULT '',
      backup_status TEXT NOT NULL DEFAULT '',
      client_account TEXT NOT NULL DEFAULT '',
      client_id TEXT NOT NULL DEFAULT '',
      sip_host TEXT NOT NULL DEFAULT '',
      idle INTEGER NOT NULL DEFAULT 1 CHECK (idle = 1),
      place_call INTEGER NOT NULL DEFAULT 0 CHECK (place_call = 0),
      detail TEXT NOT NULL DEFAULT '',
      checked_at TEXT NOT NULL DEFAULT ''
    );
  `);
  const insertSwitch = database.prepare("INSERT INTO ai_switches (code, enabled, updated_at) VALUES (?, 0, '') ON CONFLICT(code) DO NOTHING");
  for (const item of AI_SWITCHES) insertSwitch.run(item.code);
  const draft = DRAFT_NOTIFICATION_AGREEMENT;
  database.prepare("INSERT INTO ai_agreements (feature_code, version, title, body, digest, updated_at) VALUES ('notifications', 1, ?, ?, ?, '') ON CONFLICT(feature_code, version) DO NOTHING")
    .run(draft.title, draft.body, agreementDigest(draft.title, draft.body));
  database.prepare("INSERT INTO ai_audio_policy (id, max_seconds, max_bytes, retention_days, preview_enabled) VALUES (1, 60, 2000000, 365, 0) ON CONFLICT(id) DO NOTHING").run();
  database.prepare("INSERT INTO ai_notify_policy (id, repeats, promo_enabled, window_start, window_end, time_zone) VALUES (1, 1, 0, '', '', '') ON CONFLICT(id) DO NOTHING").run();
  const extensionCols = new Set((database.prepare("PRAGMA table_info(pbx_extensions)").all() as { name: string }[]).map((column) => column.name));
  if (!extensionCols.has("former_number")) database.exec("ALTER TABLE pbx_extensions ADD COLUMN former_number TEXT NOT NULL DEFAULT ''");
  if (!extensionCols.has("removed_at")) database.exec("ALTER TABLE pbx_extensions ADD COLUMN removed_at TEXT NOT NULL DEFAULT ''");
  if (!extensionCols.has("welcome_note")) database.exec("ALTER TABLE pbx_extensions ADD COLUMN welcome_note TEXT NOT NULL DEFAULT ''");
  if (!extensionCols.has("ai_role")) database.exec("ALTER TABLE pbx_extensions ADD COLUMN ai_role TEXT NOT NULL DEFAULT ''");
  if (!extensionCols.has("ai_name")) database.exec("ALTER TABLE pbx_extensions ADD COLUMN ai_name TEXT NOT NULL DEFAULT ''");
  const engineCols = new Set((database.prepare("PRAGMA table_info(ai_engines)").all() as { name: string }[]).map((column) => column.name));
  if (!engineCols.has("secret")) database.exec("ALTER TABLE ai_engines ADD COLUMN secret TEXT NOT NULL DEFAULT ''");
  stripCustomerHyphens(database);
}

function stripCustomerHyphens(database: Database.Database) {
  const users = database.prepare("SELECT id, customer_code FROM users WHERE instr(customer_code, '-') > 0").all() as { id: number; customer_code: string }[];
  const saveUser = database.prepare("UPDATE users SET customer_code = ? WHERE id = ? AND customer_code = ?");
  for (const row of users) {
    const next = customerCodeWithoutHyphen(row.customer_code);
    if (next === row.customer_code) continue;
    const taken = database.prepare("SELECT id FROM users WHERE customer_code = ?").get(next) as { id: number } | undefined;
    if (taken && taken.id !== row.id) continue;
    saveUser.run(next, row.id, row.customer_code);
  }
  const clients = database.prepare("SELECT user_id, email FROM voip_clients WHERE instr(email, '-') > 0").all() as { user_id: number; email: string }[];
  const saveClient = database.prepare("UPDATE voip_clients SET email = ? WHERE user_id = ? AND email = ?");
  for (const row of clients) {
    const at = row.email.lastIndexOf("@");
    if (at < 1) continue;
    const next = `${customerCodeWithoutHyphen(row.email.slice(0, at))}@${row.email.slice(at + 1)}`;
    if (next !== row.email) saveClient.run(next, row.user_id, row.email);
  }
  const recordings = database.prepare("SELECT id, customer_code FROM recordings WHERE instr(customer_code, '-') > 0").all() as { id: number; customer_code: string }[];
  const saveRecording = database.prepare("UPDATE recordings SET customer_code = ? WHERE id = ? AND customer_code = ?");
  for (const row of recordings) {
    const next = customerCodeWithoutHyphen(row.customer_code);
    if (next !== row.customer_code) saveRecording.run(next, row.id, row.customer_code);
  }
}

function put(database: Database.Database, key: string, value: unknown) {
  database
    .prepare(
      `INSERT INTO documents (key, json, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO NOTHING`,
    )
    .run(key, JSON.stringify(value), new Date().toISOString());
}

function seed(database: Database.Database) {
  put(database, "theme", defaultTheme);
  put(database, "flags", defaultFlags);
  put(database, "nav", defaultNav);
  put(database, "footer", defaultFooter);
  put(database, "services", defaultServices);
  put(database, "plans", defaultPlans);
  put(database, "minute_bundles", defaultMinuteBundles);
  put(database, "faqs", defaultFaqs);
  put(database, "personas", defaultPersonas);
  put(database, "extension_plan", defaultExtensionPlan);
  for (const [key, value] of Object.entries(defaultPages)) put(database, `page.${key}`, value);
  upgradeContent(database);

  const admin = database.prepare("SELECT id FROM users WHERE role = 'super_admin' LIMIT 1").get();
  if (!admin) {
    const env = process.env;
    const email = env["ADMIN_EMAIL"] || "admin@sauticall.test";
    const password = env["ADMIN_PASSWORD"] || "SautiCall-Admin-2026";
    database
      .prepare("INSERT INTO users (email, name, password_hash, role, mfa_secret, created_at) VALUES (?, ?, ?, 'super_admin', NULL, ?)")
      .run(email, "SautiCall Admin", hashPassword(password), new Date().toISOString());
  }
  const gatewayCount = database.prepare("SELECT COUNT(*) AS n FROM gateways").get() as { n: number };
  if (gatewayCount.n === 0) {
    const insert = database.prepare(
      `INSERT INTO gateways (name, provider_key, public_label, enabled, priority, mode, currencies, config_json, secret_ref)
       VALUES (?, ?, ?, ?, ?, 'test', 'USD', '{}', '')`,
    );
    insert.run("Stripe", "stripe", "Card via Stripe", 1, 10);
    insert.run("PayPal", "paypal", "PayPal", 0, 20);
  }
  const connection = database.prepare("INSERT INTO connections (provider, enabled, public_json, secret) VALUES (?, 0, ?, '') ON CONFLICT(provider) DO NOTHING");
  connection.run("voipms", JSON.stringify({ api_username: "", endpoint: "https://voip.ms/api/v1/rest.php", routing: "", pop: "", dialtime: "60", cnam: "0", billing_type: "1" }));
  connection.run("3cx", JSON.stringify({ base_url: "", client_id: "" }));
  seedDesk(database);
}

export function readDoc<T>(key: string): T {
  const row = getDb().prepare("SELECT json FROM documents WHERE key = ?").get(key) as { json: string };
  return JSON.parse(row.json) as T;
}

export function writeDoc(key: string, value: unknown, actor: string) {
  getDb()
    .prepare("UPDATE documents SET json = ?, updated_at = ? WHERE key = ?")
    .run(JSON.stringify(value), new Date().toISOString(), key);
  audit(actor, "document.update", key);
}

export function audit(actor: string, action: string, target: string) {
  getDb().prepare("INSERT INTO audit_log (actor, action, target, created_at) VALUES (?, ?, ?, ?)").run(actor, action, target, new Date().toISOString());
}

export function flagOn(key: string) {
  const flags = readDoc<{ key: string; enabled: boolean }[]>("flags");
  return flags.find((flag) => flag.key === key)?.enabled === true;
}
