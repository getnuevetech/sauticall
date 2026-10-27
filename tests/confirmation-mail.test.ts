import assert from "node:assert/strict";
import test from "node:test";
import { confirmationMail } from "../lib/confirmation-mail.ts";

test("the confirmation email shows the code in the subject and the first line", () => {
  const mail = confirmationMail({ name: "Ada", code: "123456", link: "https://sauticall.example/account/verify?token=abc" });
  assert.equal(mail.subject, "Your SautiCall code is 123456");
  assert.equal(mail.text.startsWith("Your SautiCall code is 123456."), true);
  assert.match(mail.text, /https:\/\/sauticall.example\/account\/verify\?token=abc/);
});
