import assert from "node:assert/strict";
import test from "node:test";
import { PLAN_SETUP_PATH, accountStartSteps, nextStartStep } from "../lib/account-start.ts";

const empty = { numbers: 0, hours: false, groups: 0, calls: 0, aiIncluded: false };

test("an account without a plan starts at choosing a plan", () => {
  const steps = accountStartSteps({ ...empty, hasPlan: false });
  const next = nextStartStep(steps);
  assert.equal(next?.kind, "plan");
  assert.equal(next?.href, PLAN_SETUP_PATH);
  assert.equal(next?.action, "Choose a plan");
  assert.equal(steps.filter((step) => !step.done).every((step) => step.href === PLAN_SETUP_PATH), true);
  assert.equal(steps.some((step) => step.href === "/account/numbers"), false);
});

test("a paid plan moves the next step to a business number", () => {
  const steps = accountStartSteps({ ...empty, hasPlan: true });
  const next = nextStartStep(steps);
  assert.equal(steps.find((step) => step.kind === "plan")?.done, true);
  assert.equal(next?.kind, "number");
  assert.equal(next?.href, "/account/numbers");
  assert.equal(next?.action, "Get started");
});
