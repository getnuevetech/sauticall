import type { AccountAiCode } from "./ai-account";

export const AI_WORKSPACE_TABS = ["overview", "instructions", "configuration", "activity"] as const;
export type AiWorkspaceTab = (typeof AI_WORKSPACE_TABS)[number];
export const INSTRUCTION_MAX = 4000;

type WorkspaceProfile = {
  instructionTab: string;
  editorLabel: string;
  usesExtension: boolean;
  virtualDestination: boolean;
  usesSwitch: boolean;
  guidance: string[];
  template: string;
  workflow: string;
};

const WORKSPACES: Record<AccountAiCode, WorkspaceProfile> = {
  receptionist: {
    instructionTab: "Prompt & instructions",
    editorLabel: "Greeting, business information, caller questions, and routing",
    usesExtension: true,
    virtualDestination: true,
    usesSwitch: true,
    guidance: [
      "Write how this receptionist greets callers, what the business is willing to share, which questions to ask, and how a caller should reach a person.",
      "SautiCall safety rules stay on and are not edited here.",
      "Saving these instructions does not place a call or move the phone number. Calls stay on the ring group until the virtual destination is certified.",
    ],
    template: [
      "Greeting:",
      "Thank you for calling. How can I help you today?",
      "",
      "Business information:",
      "Share the business name, hours, and location this account is willing to give callers.",
      "",
      "Caller questions:",
      "Ask for the caller's name and the reason for the call.",
      "",
      "Routing instructions:",
      "Offer a person on this account when the caller asks for one. Do not promise a transfer that is not already on the phone system.",
    ].join("\n"),
    workflow: "This receptionist is a virtual destination. It does not use a desk phone or softphone. Until 3CX certifies it, calls stay on the Main ring group.",
  },
  personal_assistant: {
    instructionTab: "Prompt & instructions",
    editorLabel: "Screening, availability, and information it may share",
    usesExtension: true,
    virtualDestination: true,
    usesSwitch: true,
    guidance: [
      "Write how calls for this person are screened, when they are available, and which details the assistant may share.",
      "SautiCall safety rules stay on and are not edited here.",
      "Saving these instructions does not place a call or change phone-system routing.",
    ],
    template: [
      "Screening preferences:",
      "Ask for the caller's name and why they are calling before offering to reach this person.",
      "",
      "Availability:",
      "Describe when this person takes calls and what to say when they are unavailable.",
      "",
      "Information it may share:",
      "List only what a caller may be told. Anything not listed stays private.",
    ].join("\n"),
    workflow: "This assistant screens calls for one person. It does not answer as the company receptionist.",
  },
  outbound_assistant: {
    instructionTab: "Prompt & instructions",
    editorLabel: "Objective, conversation boundaries, and completion",
    usesExtension: true,
    virtualDestination: false,
    usesSwitch: true,
    guidance: [
      "Write the one task this outbound conversation may complete, what it must not discuss, and how the conversation is finished.",
      "SautiCall safety rules stay on and are not edited here.",
      "Saving these instructions does not place a call or change phone-system routing.",
    ],
    template: [
      "Objective:",
      "State the one task this outbound conversation is allowed to complete.",
      "",
      "Conversation boundaries:",
      "List topics it must not discuss and promises it must not make.",
      "",
      "Completion criteria:",
      "Describe how the conversation is finished. No call is placed from this page.",
    ].join("\n"),
    workflow: "Outbound conversations stay on this assistant. They are not sent through the receptionist, and this page does not place a call.",
  },
  setup_assistant: {
    instructionTab: "Prompt & instructions",
    editorLabel: "Requirements and constraints for the proposed phone setup",
    usesExtension: false,
    virtualDestination: false,
    usesSwitch: true,
    guidance: [
      "Write the requirements and constraints for a phone-system proposal. A person still reviews the proposal.",
      "SautiCall safety rules stay on and are not edited here.",
      "Saving these instructions does not change the phone system or place a call.",
    ],
    template: [
      "Requirements:",
      "Describe the people, numbers, and hours the proposed phone system should cover.",
      "",
      "Constraints:",
      "List what the proposal must not change, including existing numbers and after-hours handling.",
    ].join("\n"),
    workflow: "This assistant drafts a proposal for review. It does not change routing.",
  },
  notifications: {
    instructionTab: "Script & instructions",
    editorLabel: "Approved message, introduction, and recipient choice",
    usesExtension: false,
    virtualDestination: false,
    usesSwitch: true,
    guidance: [
      "Write the approved message, the introduction people hear, and the wording for press 1, press 2, and press 9.",
      "SautiCall safety rules stay on and are not edited here.",
      "Saving this script does not place a call. The notification workflow is separate from the receptionist.",
    ],
    template: [
      "Approved message:",
      "Write the message a recipient hears only after they press 1.",
      "",
      "Introduction:",
      "Give the business name people should hear before they choose.",
      "",
      "Recipient choice:",
      "Press 1 hears the message. Press 2 declines it. Press 9 stops future notifications. Silence is not a yes.",
    ].join("\n"),
    workflow: "Recipients, caller ID, and kept audio are prepared in the notification workflow. This script does not start a call.",
  },
  tts: {
    instructionTab: "Script & instructions",
    editorLabel: "Script, pronunciation, and speaking style",
    usesExtension: false,
    virtualDestination: false,
    usesSwitch: false,
    guidance: [
      "Write the words to speak, how unusual names should sound, and the speaking style.",
      "SautiCall safety rules stay on and are not edited here.",
      "Saving this script does not place a call. Text to voice does not use a receptionist extension.",
    ],
    template: [
      "Script:",
      "Write the words to be spoken.",
      "",
      "Pronunciation:",
      "Spell unusual names and say how they should sound.",
      "",
      "Speaking style:",
      "Calm, brief, and clear.",
    ].join("\n"),
    workflow: "Stored audio and voice choices stay on the text-to-voice page. This service does not answer calls.",
  },
  stt: {
    instructionTab: "Recognition settings",
    editorLabel: "Recognition hints and expected responses",
    usesExtension: false,
    virtualDestination: false,
    usesSwitch: false,
    guidance: [
      "List words callers are likely to say and the responses this account expects. Speech to text is not a general instruction box.",
      "SautiCall safety rules stay on and are not edited here.",
      "Saving these settings does not place a call. The keypad still works.",
    ],
    template: [
      "Recognition hints:",
      "Yes, no, and stop.",
      "",
      "Expected responses:",
      "Yes accepts. No declines. Stop opts out. When speech is unclear, the keypad still works.",
    ].join("\n"),
    workflow: "Recognition listens for yes, no, and stop. It does not inherit receptionist setup.",
  },
};

export function workspaceProfile(code: AccountAiCode) {
  return WORKSPACES[code];
}

export function switchCodeFor(code: AccountAiCode): "" | "notifications" | "receptionist" | "personal_assistant" | "outbound_assistant" | "setup_assistant" {
  if (code === "tts" || code === "stt") return "";
  return code;
}

export function workspaceTab(value: string | undefined): AiWorkspaceTab {
  return (AI_WORKSPACE_TABS as readonly string[]).includes(value || "") ? (value as AiWorkspaceTab) : "overview";
}

export function accountAiPath(next: string, fallback: string) {
  if (!next.startsWith("/account/ai") || next.startsWith("//") || next.includes("://") || next.includes("..") || next.includes("\\")) return fallback;
  return next;
}

export function validateAccountInstructions(value: string) {
  const body = value.replace(/\0/g, "").replace(/\r\n/g, "\n").trim();
  if (body.length > INSTRUCTION_MAX) return { ok: false as const, message: "Instructions must be 4,000 characters or fewer." };
  return { ok: true as const, body };
}

export type SetupFacts = {
  included: boolean;
  named: boolean;
  hasInstructions: boolean;
  extensionAssigned: boolean;
  serviceOn: boolean;
  termsOpen: boolean;
};

export type SetupCheck = { key: string; label: string; detail: string; done: boolean };

export function serviceChecks(code: AccountAiCode, facts: SetupFacts): SetupCheck[] {
  const profile = WORKSPACES[code];
  const plan: SetupCheck = {
    key: "plan",
    label: "Plan",
    detail: facts.included ? "Included on this plan." : "Not included on this plan.",
    done: facts.included,
  };
  if (!facts.included) return [plan];
  const items: SetupCheck[] = [plan];
  if (profile.usesSwitch) {
    items.push({
      key: "enabled",
      label: "Enabled",
      detail: facts.termsOpen ? "Terms or review still apply before this service can be turned on." : facts.serviceOn ? "On for this account." : "Off. Turning it on does not place a call.",
      done: facts.serviceOn && !facts.termsOpen,
    });
  }
  items.push({
    key: "configured",
    label: "Configured",
    detail: facts.named ? "A name is saved for this service." : "Needs a name.",
    done: facts.named,
  });
  if (profile.virtualDestination) {
    items.push({
      key: "extension",
      label: "Virtual destination",
      detail: facts.extensionAssigned
        ? "A virtual destination is saved. Calls stay on the ring group until 3CX certifies it."
        : "Create this under AI extensions. A phone extension is not used.",
      done: facts.extensionAssigned,
    });
  } else if (profile.usesExtension) {
    items.push({
      key: "extension",
      label: "Extension",
      detail: facts.extensionAssigned ? "An extension on this account is assigned. Routing is unchanged." : "No extension assigned.",
      done: facts.extensionAssigned,
    });
  }
  items.push({
    key: "instructions",
    label: profile.instructionTab,
    detail: facts.hasInstructions ? "Instructions are saved for this account." : "Nothing is saved in the editor yet.",
    done: facts.hasInstructions,
  });
  items.push({
    key: "calls",
    label: "Live calls",
    detail: profile.usesExtension || code === "notifications" ? "Off. Saving settings does not start a call or change routing." : "Off. This service does not answer or place a call from this page.",
    done: false,
  });
  return items;
}

export function nextSetupStep(code: AccountAiCode, facts: SetupFacts, planName: string) {
  const profile = WORKSPACES[code];
  const base = `/account/ai/services/${code}`;
  if (!facts.included) return { href: "/account/billing/plan", label: "See plans", summary: `Not included on ${planName || "this account"}.` };
  if (facts.termsOpen) return { href: `${base}?tab=overview`, label: "Review access", summary: "Finish the terms or review step before turning this on." };
  if (profile.virtualDestination) {
    return {
      href: "/account/ai#configure",
      label: "Configure",
      summary: facts.extensionAssigned
        ? "Virtual destination saved. The number stays on the ring group until 3CX certifies it."
        : "Configure the name, prompt, number, and answering mode. No phone is assigned.",
    };
  }
  if (!facts.named) return { href: `${base}?tab=configuration`, label: "Add a name", summary: "Included. Add a name to configure this service." };
  if (!facts.hasInstructions) return { href: `${base}?tab=instructions`, label: profile.instructionTab, summary: "Configured. Add the instructions for this service." };
  if (profile.usesExtension && !facts.extensionAssigned) return { href: `${base}?tab=configuration`, label: "Assign an extension", summary: "Instructions are saved. Assign an extension when this service should belong to a person." };
  if (profile.usesSwitch && !facts.serviceOn) return { href: `${base}?tab=overview`, label: "Turn on", summary: "Setup is saved. Turn the service on when you want it available. Live calls stay off." };
  return { href: `${base}?tab=activity`, label: "View activity", summary: "Set up on this account. Live calls stay off." };
}

export function aiSaveNotice(saved: string | undefined) {
  if (saved === "terms") return "Terms accepted. No call was placed.";
  if (saved === "requested") return "Request sent. No call was placed.";
  if (saved === "service") return "Saved. No call was placed.";
  if (saved === "configured") return "Settings saved. Routing was not changed, and no call was placed.";
  if (saved === "prompt") return "Instructions saved. No call was placed and routing was not changed.";
  if (saved === "restored") return "Starting template restored. No call was placed and routing was not changed.";
  if (saved === "extension") return "AI extension saved. The phone number was not moved, and no call was placed.";
  if (saved === "deleted") return "Receptionist deleted. The phone number stays on the ring group. You can create another receptionist with the same name. No call was placed.";
  return "";
}
