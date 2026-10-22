import crypto from "crypto";
import type Database from "better-sqlite3";
import { DEFAULT_ROLES } from "./access-catalog";

export function seedDesk(database: Database.Database) {
  const insertRole = database.prepare(
    "INSERT INTO access_roles (name, description, permissions_json) SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM access_roles WHERE name = ?)",
  );
  for (const role of DEFAULT_ROLES) insertRole.run(role.name, role.description, JSON.stringify(role.permissions), role.name);

  const insertGroup = database.prepare("INSERT INTO ticket_groups (name, description) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM ticket_groups WHERE name = ?)");
  insertGroup.run("Customer support", "Website, account access, and general help.", "Customer support");
  insertGroup.run("Accounts", "Billing, payments, and invoices.", "Accounts");
  insertGroup.run("Phone operations", "Numbers, extensions, ring groups, and call quality.", "Phone operations");

  const groupId = (name: string) => (database.prepare("SELECT id FROM ticket_groups WHERE name = ?").get(name) as { id: number } | undefined)?.id || 0;
  const insertTopic = database.prepare("INSERT INTO ticket_topics (name, group_id, enabled) SELECT ?, ?, 1 WHERE NOT EXISTS (SELECT 1 FROM ticket_topics WHERE name = ?)");
  const topics: [string, string][] = [
    ["Billing and payments", "Accounts"],
    ["Phone service", "Phone operations"],
    ["Website and account access", "Customer support"],
    ["General", "Customer support"],
  ];
  for (const [name, group] of topics) {
    const id = groupId(group);
    if (id) insertTopic.run(name, id, name);
  }

  database
    .prepare(
      `INSERT INTO mail_settings (id, inbound_secret, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from, smtp_secure)
       SELECT 1, ?, '', 587, '', '', '', 0 WHERE NOT EXISTS (SELECT 1 FROM mail_settings WHERE id = 1)`,
    )
    .run(crypto.randomBytes(24).toString("hex"));

  const posts = database.prepare("SELECT COUNT(*) AS n FROM faq_posts").get() as { n: number };
  if (posts.n === 0) {
    const now = new Date().toISOString();
    database
      .prepare("INSERT INTO faq_posts (slug, title, excerpt, body, published, author_name, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)")
      .run(
        "how-support-works",
        "How do I get help with my phone service?",
        "Open a ticket in your account and the right team will see it.",
        "Sign in and open Support tickets. Choose the topic that fits, then describe what happened.\n\n## What happens next\n\n- Billing questions go to the accounts team.\n- Phone service questions go to phone operations.\n- Website and sign-in questions go to customer support.\n\nYou can reply on the ticket. If incoming email is connected, a reply to the notification also lands on the same ticket.",
        "SautiCall",
        now,
        now,
      );
  }
}
