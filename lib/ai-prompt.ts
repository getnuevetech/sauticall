import { userCreateBody } from "./pbx-user.ts";

export type ReceptionistPerson = { name: string; number: string; live: boolean };
export type ReceptionistGroup = { name: string; kind: "ring" | "queue"; number: string; live: boolean };

export type CompanyFacts = {
  company: string;
  open: string;
  close: string;
  address: string;
  numbers: string[];
  people: ReceptionistPerson[];
  groups: ReceptionistGroup[];
  anyLanguage: boolean;
  extra: string;
};

export type DirectoryEntry = {
  Name: string;
  Number: string;
  Description: string;
  Type: "Extension" | "RingGroup" | "Queue";
};

const EXTRA_MAX = 1500;
const PROMPT_MAX = 6000;
const LIST_MAX = 40;

export function cleanExtra(value: string) {
  return value.replace(/\u0000/g, "").replace(/\s+/g, " ").trim().slice(0, EXTRA_MAX);
}

export function companyFactsFrom(input: {
  company?: string;
  open?: string;
  close?: string;
  address?: string;
  numbers?: string[];
  people?: ReceptionistPerson[];
  groups?: ReceptionistGroup[];
  anyLanguage?: boolean;
  extra?: string;
}): CompanyFacts {
  const company = (input.company || "").trim().replace(/\s+/g, " ").slice(0, 50);
  return {
    company,
    open: /^\d{2}:\d{2}$/.test(input.open || "") ? input.open || "" : "",
    close: /^\d{2}:\d{2}$/.test(input.close || "") ? input.close || "" : "",
    address: (input.address || "").trim().replace(/\s+/g, " ").slice(0, 160),
    numbers: [...new Set((input.numbers || []).map((item) => item.trim()).filter(Boolean))].slice(0, 20),
    people: (input.people || []).filter((person) => person.name.trim() && /^\d+$/.test(person.number)).slice(0, LIST_MAX),
    groups: (input.groups || []).filter((group) => group.name.trim() && /^\d+$/.test(group.number)).slice(0, LIST_MAX),
    anyLanguage: Boolean(input.anyLanguage),
    extra: cleanExtra(input.extra || ""),
  };
}

export function buildReceptionist(facts: CompanyFacts) {
  if (!facts.company) {
    return { missing: "Enter the company name on the business profile before the receptionist can be saved.", greeting: "", prompt: "", directory: [] as DirectoryEntry[] };
  }
  const directory = directoryFor(facts);
  const lines = [
    `You are the receptionist for ${facts.company}. You answer only for this company.`,
    facts.address ? `The business is at ${facts.address}.` : "",
    facts.numbers.length ? `The business numbers are ${facts.numbers.join(", ")}.` : "",
    facts.open && facts.close
      ? `Open hours are ${facts.open} to ${facts.close}. Outside those hours, tell the caller the business is closed and offer to take their name and a number to call back.`
      : "Open hours are not saved. Offer to take the caller's name and a number to call back when nobody is available.",
    peopleCopy(facts),
    groupsCopy(facts),
    "Transfer only to a person or group listed here.",
    "Do not say extension numbers.",
    "Keep every reply to one short sentence.",
    facts.anyLanguage
      ? "Reply in the language the caller is speaking. If they change language, change with them."
      : "Reply in English.",
    facts.extra ? `Additional instructions: ${facts.extra}` : "",
  ].filter(Boolean);
  return {
    missing: "",
    greeting: `Hello, thank you for calling ${facts.company}.`,
    prompt: lines.join("\n").slice(0, PROMPT_MAX),
    directory,
  };
}

function peopleCopy(facts: CompanyFacts) {
  if (!facts.people.length) return "No people are saved yet. Offer to take the caller's name and a number to call back.";
  const rows = facts.people.map((person) => (person.live ? person.name : `${person.name} is not available yet`));
  return `People you can connect:\n${rows.map((row) => `- ${row}`).join("\n")}`;
}

function groupsCopy(facts: CompanyFacts) {
  if (!facts.groups.length) return "";
  const rows = facts.groups.map((group) => {
    const kind = group.kind === "queue" ? "call queue" : "ring group";
    return group.live ? `${group.name}, a ${kind}` : `${group.name}, a ${kind}, is not available yet`;
  });
  return `Groups you can connect:\n${rows.map((row) => `- ${row}`).join("\n")}`;
}

function directoryFor(facts: CompanyFacts): DirectoryEntry[] {
  const people = facts.people.filter((person) => person.live).map((person) => ({
    Name: person.name,
    Number: person.number,
    Description: `Person at ${facts.company}`,
    Type: "Extension" as const,
  }));
  const groups = facts.groups.filter((group) => group.live).map((group) => ({
    Name: group.name,
    Number: group.number,
    Description: `${group.kind === "queue" ? "Call queue" : "Ring group"} at ${facts.company}`,
    Type: group.kind === "queue" ? "Queue" as const : "RingGroup" as const,
  }));
  return [...people, ...groups];
}

export function agentSettings(facts: CompanyFacts) {
  const built = buildReceptionist(facts);
  return {
    AgentType: "receptionist",
    FirstMessage: built.greeting,
    SystemPrompt: built.prompt,
    Language: "EN",
    SwitchLanguage: facts.anyLanguage,
    EnableNameMatching: true,
    CheckStatusBeforeTransfer: true,
    RoutingDirectory: built.directory,
  };
}

export function receptionistCreateBody(input: {
  company: string;
  email: string;
  number: string;
  password: string;
  groupId?: number;
  settings: ReturnType<typeof agentSettings>;
}) {
  const body = userCreateBody({
    firstName: input.company.slice(0, 40),
    lastName: "Receptionist",
    email: input.email,
    number: input.number,
    password: input.password,
  });
  return {
    ...body,
    AIAgent: true,
    Enabled: true,
    HideInPhonebook: true,
    AgentSettings: input.settings,
    ...(input.groupId ? { Groups: [{ GroupId: input.groupId, Rights: { RoleName: "users" } }] } : {}),
  };
}

export function receptionistPatchBody(input: {
  id: number;
  company: string;
  groupId?: number;
  settings: ReturnType<typeof agentSettings>;
}) {
  return {
    Id: input.id,
    FirstName: input.company.slice(0, 40),
    LastName: "Receptionist",
    AIAgent: true,
    Enabled: true,
    HideInPhonebook: true,
    AgentSettings: input.settings,
    ...(input.groupId ? { Groups: [{ GroupId: input.groupId, Rights: { RoleName: "users" } }] } : {}),
  };
}
