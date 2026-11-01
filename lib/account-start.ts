export const PLAN_SETUP_PATH = "/account/billing/plan";

export type StartStep = {
  kind: "account" | "plan" | "number" | "hours" | "answer" | "test";
  title: string;
  detail: string;
  href: string;
  done: boolean;
  action: string;
};

export function accountStartSteps(input: {
  hasPlan: boolean;
  numbers: number;
  hours: boolean;
  groups: number;
  calls: number;
  aiIncluded: boolean;
}): StartStep[] {
  const next = input.hasPlan;
  return [
    { kind: "account", title: "Create your account", detail: "Your workspace is ready.", href: "/account", done: true, action: "" },
    { kind: "plan", title: "Choose a plan", detail: "A plan opens numbers, people, and calling.", href: PLAN_SETUP_PATH, done: input.hasPlan, action: "Choose a plan" },
    { kind: "number", title: "Connect a business number", detail: "Get a new number or transfer your existing one.", href: next ? "/account/numbers" : PLAN_SETUP_PATH, done: input.numbers > 0, action: next ? "Get started" : "Choose a plan" },
    { kind: "hours", title: "Set your business hours", detail: "Choose when you want to take calls.", href: next ? "/account/phone" : PLAN_SETUP_PATH, done: input.hours, action: next ? "Set hours" : "Choose a plan" },
    { kind: "answer", title: "Choose how calls are answered", detail: "Set up your AI receptionist or call routing.", href: next ? (input.aiIncluded ? "/account/ai" : "/account/phone") : PLAN_SETUP_PATH, done: input.groups > 0, action: next ? "Set up" : "Choose a plan" },
    { kind: "test", title: "Make a test call", detail: "See everything working before you go live.", href: next ? "/account/phone" : PLAN_SETUP_PATH, done: input.calls > 0, action: next ? "Start" : "Choose a plan" },
  ];
}

export function nextStartStep(steps: StartStep[]) {
  return steps.find((step) => !step.done);
}
