import assert from "node:assert/strict";
import test from "node:test";
import { ADMIN_NAV, DEFAULT_ROLES, PERMISSIONS, permissionForDocument } from "../lib/access-catalog.ts";
import { defaultFlags } from "../lib/seed-data.ts";
import { flagGroups } from "../lib/admin-controls.ts";
import { WEBSITE_LINKS } from "../lib/admin-website.ts";
import { renderFaq, slugify } from "../lib/faq-markdown.ts";
import { nextFreeNumber } from "../lib/group-numbers.ts";
import { parseMailPayload, ticketIdFromText } from "../lib/mail-parse.ts";

const keys = new Set(PERMISSIONS.map((item) => item.key));

test("seeded access levels only use known permissions", () => {
  for (const role of DEFAULT_ROLES) {
    for (const permission of role.permissions) assert.ok(keys.has(permission), permission);
  }
  assert.equal(permissionForDocument("page.home"), "content.home");
  assert.equal(permissionForDocument("minute_bundles"), "content.bundles");
  assert.equal(permissionForDocument("unknown"), "");
  assert.deepEqual(ADMIN_NAV.map((group) => group.title), ["Customers", "Phone operations", "Catalog & billing", "Integrations", "Platform controls", "Website & content", "Support desk", "Team & access"]);
  const website = WEBSITE_LINKS.map((link) => link.href);
  assert.ok(website.includes("/admin/theme"));
  assert.ok(website.includes("/admin/content/page.home"));
  assert.ok(website.includes("/admin/content/page.help"));
  assert.equal(permissionForDocument("page.help"), "content.faqs");
  assert.equal(website.includes("/admin/gateways"), false);
  assert.equal(website.includes("/admin/content/plans"), false);
  assert.ok(ADMIN_NAV.find((group) => group.title === "Catalog & billing")?.links.some((link) => link.href === "/admin/content/plans"));
  assert.ok(ADMIN_NAV.find((group) => group.title === "Integrations")?.links.some((link) => link.href === "/admin/gateways"));
  assert.ok(ADMIN_NAV.find((group) => group.title === "Customers")?.links.some((link) => link.href === "/admin/customers"));
  assert.ok(ADMIN_NAV.find((group) => group.title === "Team & access")?.links.some((link) => link.href === "/admin/team"));
  assert.ok(ADMIN_NAV.find((group) => group.title === "Team & access")?.links.some((link) => link.href === "/admin/access"));
  const grouped = new Set(flagGroups(defaultFlags).flatMap((group) => group.rows.map((row) => row.key)));
  for (const flag of defaultFlags) assert.ok(grouped.has(flag.key), flag.key);
});

test("group numbers skip extensions and other groups", () => {
  assert.equal(nextFreeNumber(["800", "801"], 800), "802");
  assert.equal(nextFreeNumber(["900"], 900), "901");
});

test("faq markdown escapes html and keeps safe links", () => {
  const html = renderFaq("# Title\n\nHello <script>\n\n- **One**\n- [Site](https://example.com)\n- [Bad](javascript:alert(1))");
  assert.match(html, /<h2>Title<\/h2>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<strong>One<\/strong>/);
  assert.match(html, /href="https:\/\/example.com"/);
  assert.doesNotMatch(html, /javascript:/);
  assert.equal(slugify("How do I get help?"), "how-do-i-get-help");
});

test("inbound mail accepts provider shapes and ticket numbers", () => {
  const postmark = parseMailPayload({
    FromFull: { Email: "Ada@Example.com", Name: "Ada" },
    Subject: "Re: Help [SC-12]",
    TextBody: "Still broken",
    MessageID: "<abc@mail>",
    Headers: [{ Name: "In-Reply-To", Value: "<earlier@mail>" }],
  });
  assert.equal(postmark?.fromEmail, "ada@example.com");
  assert.equal(postmark?.messageId, "abc@mail");
  assert.deepEqual(postmark?.referenceIds, ["earlier@mail"]);
  assert.equal(ticketIdFromText(postmark?.subject || ""), 12);

  const mailgun = parseMailPayload({ sender: "Bea <bea@example.com>", subject: "New", "body-plain": "Hello", "Message-Id": "<gun@mail>" });
  assert.equal(mailgun?.fromEmail, "bea@example.com");
  assert.equal(mailgun?.fromName, "Bea");

  const sendgrid = parseMailPayload({ from: "cy@example.com", subject: "Hi", text: "There", headers: "In-Reply-To: <old@mail>\nMessage-ID: <new@mail>" });
  assert.equal(sendgrid?.fromEmail, "cy@example.com");
  assert.deepEqual(sendgrid?.referenceIds, ["old@mail"]);
  assert.equal(parseMailPayload({ subject: "No from" }), null);
});
