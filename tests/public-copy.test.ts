import assert from "node:assert/strict";
import test from "node:test";
import { copyLine, liveCopy, mergeMissingDeep } from "../lib/public-copy.ts";

test("live page wording is added without replacing an edited sentence", () => {
  const page = { titleLead: "Kept by the admin" };
  assert.equal(mergeMissingDeep(page, liveCopy["page.home"]), true);
  assert.equal(page.titleLead, "Kept by the admin");
  const shown = (page as { shown?: { title?: string } }).shown;
  assert.equal(shown?.title, "Your business phone system.");
  assert.equal(mergeMissingDeep(page, liveCopy["page.home"]), false);
});

test("a public page reads the saved sentence", () => {
  const page = { shown: { title: "Edited heading", kicker: "" } };
  assert.equal(copyLine(page, "page.home", "title"), "Edited heading");
  assert.equal(copyLine(page, "page.home", "kicker"), "Business calling, connected");
});
