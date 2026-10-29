import assert from "node:assert/strict";
import test from "node:test";
import { agentSettings, buildReceptionist, companyFactsFrom, receptionistCreateBody } from "../lib/ai-prompt.ts";

const facts = companyFactsFrom({
  company: "TellMeltsReal",
  open: "09:00",
  close: "17:00",
  address: "100 Main Street, Houston TX 77002",
  numbers: ["2025550101"],
  people: [
    { name: "Ada Lovelace", number: "4419", live: true },
    { name: "Grace Hopper", number: "4420", live: false },
  ],
  groups: [
    { name: "Sales", kind: "ring", number: "8801", live: true },
    { name: "Front desk", kind: "queue", number: "8902", live: false },
  ],
  anyLanguage: true,
  extra: "  Ask whether the caller needs sales or support.  ",
});

test("the prompt is built from this company's saved details", () => {
  const script = buildReceptionist(facts);
  assert.equal(script.missing, "");
  assert.equal(script.greeting, "Hello, thank you for calling TellMeltsReal.");
  assert.match(script.prompt, /receptionist for TellMeltsReal/);
  assert.match(script.prompt, /100 Main Street, Houston TX 77002/);
  assert.match(script.prompt, /09:00 to 17:00/);
  assert.match(script.prompt, /2025550101/);
  assert.match(script.prompt, /Ada Lovelace/);
  assert.match(script.prompt, /Grace Hopper is not available yet/);
  assert.match(script.prompt, /Sales, a ring group/);
  assert.match(script.prompt, /Front desk, a call queue, is not available yet/);
  assert.doesNotMatch(script.prompt, /8902/);
  assert.match(script.prompt, /Ask whether the caller needs sales or support/);
  assert.match(script.prompt, /language the caller is speaking/);
  assert.doesNotMatch(script.prompt, /4419/);
  assert.doesNotMatch(script.prompt, /8801/);
});

test("the phone-system directory keeps the extension numbers the prompt does not speak", () => {
  const settings = agentSettings(facts);
  assert.equal(settings.AgentType, "receptionist");
  assert.equal(settings.SwitchLanguage, true);
  assert.equal(settings.CheckStatusBeforeTransfer, true);
  assert.deepEqual(settings.RoutingDirectory.map((item) => [item.Name, item.Number, item.Type]), [
    ["Ada Lovelace", "4419", "Extension"],
    ["Sales", "8801", "RingGroup"],
  ]);
  assert.equal(settings.RoutingDirectory.some((item) => item.Name === "Grace Hopper"), false);
});

test("a plan without any-language stays in English", () => {
  const english = companyFactsFrom({ ...facts, anyLanguage: false, extra: "" });
  const settings = agentSettings(english);
  assert.equal(settings.SwitchLanguage, false);
  assert.match(settings.SystemPrompt, /Reply in English/);
  assert.doesNotMatch(settings.SystemPrompt, /Additional instructions/);
});

test("the receptionist is a phone-system user, and the shared company setting is left alone", () => {
  const body = receptionistCreateBody({
    company: "TellMeltsReal",
    email: "receptionist-4@sauticall.invalid",
    number: "4430",
    password: "secret-value",
    groupId: 12,
    settings: agentSettings(facts),
  });
  assert.equal(body.AIAgent, true);
  assert.equal(body.HideInPhonebook, true);
  assert.equal(body.FirstName, "TellMeltsReal");
  assert.equal(body.LastName, "Receptionist");
  assert.equal(body.Groups?.[0].Rights.RoleName, "users");
  assert.equal("CompanyName" in body, false);
  assert.equal("CompanyDescription" in body, false);
  assert.equal(body.AgentSettings.SystemPrompt.includes("TellMeltsReal"), true);
});

test("a company name is required before a prompt is written", () => {
  const script = buildReceptionist(companyFactsFrom({ people: [{ name: "Ada Lovelace", number: "4419", live: true }] }));
  assert.match(script.missing, /company name/);
  assert.equal(script.prompt, "");
  assert.equal(script.directory.length, 0);
});
