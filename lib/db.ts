import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { hashPassword } from "./auth";
import { dataDir } from "./paths";
import {
  defaultFaqs,
  defaultFlags,
  defaultFooter,
  defaultNav,
  defaultPages,
  defaultPersonas,
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
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
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
  put(database, "faqs", defaultFaqs);
  put(database, "personas", defaultPersonas);
  for (const [key, value] of Object.entries(defaultPages)) put(database, `page.${key}`, value);

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
