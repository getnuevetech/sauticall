export const liveCopy: Record<string, Record<string, unknown>> = {
  "page.home": {
    headerSignIn: "Sign in",
    shown: {
      kicker: "Business calling, connected",
      title: "Your business phone system.",
      titleAccent: "Your AI receptionist. One place.",
      lead: "Bring your business number, team extensions, desk phones and AI call handling together with SautiCall.",
      primaryCta: "View plans",
      primaryHref: "/pricing",
      secondaryCta: "Talk to us",
      secondaryHref: "/contact",
      fineNote: "Number rental and other charges may apply.",
      plansFrom: "Plans from {price}/month",
      heroAlt: "Product preview of SautiCall on a laptop, a desk phone, and a mobile phone",
      strip: [
        { title: "Business numbers", body: "Local or toll-free numbers for your business." },
        { title: "Team extensions", body: "Keep your team connected in one system." },
        { title: "AI call handling", body: "Greet, answer and route calls automatically." },
        { title: "One account", body: "Manage numbers, users and settings together." },
      ],
      togetherTitle: "Everything your calls need, working together.",
      togetherBody: "Call queues and reporting on eligible plans.",
      cards: [
        { title: "A phone system for your whole team", body: "Give everyone an extension, set business hours and keep your team in sync.", href: "/solutions#phone", link: "Learn more →" },
        { title: "A helpful first answer", body: "Let your AI receptionist answer routine questions, take messages and route calls to the right person.", href: "/ai-receptionist", link: "Learn more →" },
        { title: "Keep your business number", body: "Bring your existing number or get a new one. We'll help you transfer it.", href: "/solutions#numbers", link: "Learn more →" },
        { title: "Work from desk or mobile", body: "Use desk phones at the office or our mobile and desktop apps on the go.", href: "/solutions#phones", link: "Learn more →" },
      ],
      aiKicker: "AI receptionist",
      aiTitle: "Give every caller a clear next step.",
      aiBody: "Let your AI receptionist answer routine questions, take messages and connect callers to your team.",
      aiPoints: ["Business-specific answers", "Human handoff", "Voicemail when needed"],
      aiCta: "Explore AI receptionist",
      aiHref: "/ai-receptionist",
      aiFine: "Features and supported languages vary by plan.",
      aiAlt: "An incoming call reaches the AI receptionist, then connects to the team, a person, or voicemail.",
      setupTitle: "Tell us what you need. We'll help you find a setup.",
      setupPrompt: "We're a team of four. We need a business number and call routing.",
      setupButton: "Find my setup",
      setupSteps: [
        { title: "Choose a plan", body: "Pick the right plan for your team." },
        { title: "Connect your number", body: "Bring your existing number or get a new one." },
        { title: "Set up your team", body: "Add team members and configure call handling." },
      ],
      setupFine: "Review your setup before activation. Number transfers follow carrier approval.",
      priceTitle: "A plan for the way you work.",
      priceBody: "Compare team size, included outbound minutes and features.",
      ribbon: "For small teams",
      customLead: "Need a custom setup?",
      customCta: "Talk to us →",
      customHref: "/custom",
      faqTitle: "Frequently asked questions.",
      faqs: [
        { q: "Can I keep my existing business number?", a: "Yes. Start a number transfer from your account. The transfer finishes after the carrier approves it." },
        { q: "Can my team use desk phones and mobile apps?", a: "Yes. A compatible desk phone can be connected, and the phone app works on a computer or a mobile phone." },
        { q: "What happens when I use my included minutes?", a: "Each plan includes outbound minutes for the billing period. When those are used, you can buy a minute bundle. Bought minutes last until they are used." },
        { q: "Which plan includes the AI receptionist?", a: "Small Business and Team include the receptionist when that feature is turned on for the plan." },
      ],
      endTitle: "Make your next hello a better one.",
      endCta: "Get started",
      endHref: "/account/register",
      endSecondary: "Talk to us",
      endSecondaryHref: "/contact",
    },
  },
  "page.solutions": {
    shown: {
      kicker: "Solutions",
      title: "The right tools for every business call.",
      lead: "Connect your numbers, team and call handling in one SautiCall account.",
      primaryCta: "Explore solutions",
      primaryHref: "#phone",
      secondaryCta: "Compare plans",
      secondaryHref: "/pricing",
      heroAlt: "SautiCall on a laptop, a mobile phone, and a desk phone",
      jumps: [
        { label: "Phone system", href: "#phone" },
        { label: "Desk & mobile", href: "#phones" },
        { label: "AI receptionist", href: "#ai" },
        { label: "Contact center", href: "#center" },
        { label: "Numbers & porting", href: "#numbers" },
      ],
      chooseTitle: "What would you like to do?",
      choices: [
        { label: "Set up business calling", href: "#phone" },
        { label: "Connect my team", href: "#phones" },
        { label: "Answer with AI", href: "#ai" },
        { label: "Manage more calls", href: "#center" },
        { label: "Keep my number", href: "#numbers" },
      ],
      phoneKicker: "Cloud phone system",
      phoneTitle: "Bring your team onto one phone system.",
      phoneBody: "Manage extensions, business hours, voicemail and call routing from your account.",
      phonePoints: ["Team extensions", "Business hours and routing", "Voicemail and forwarding"],
      phoneLink: "Compare phone system plans",
      phoneHref: "/pricing",
      deskKicker: "Desk phones & softphones",
      deskTitle: "At your desk. On the move. Still your business.",
      deskBody: "Use supported desk phones and softphone apps to stay connected to your business calling setup.",
      deskPills: ["Desk phone", "Desktop", "Mobile", "Browser, where supported"],
      deskLink: "Check device compatibility",
      deskHref: "/contact",
      deskAlt: "A SautiCall desk phone beside the mobile app on a call",
      aiKicker: "AI receptionist",
      aiTitle: "A helpful first answer for your callers.",
      aiBody: "Answer routine questions, take messages and route callers to your team.",
      aiPills: ["Answers", "Messages", "Human handoff"],
      aiCta: "Explore AI receptionist",
      aiHref: "/ai-receptionist",
      aiNote: "AI features and supported languages depend on your plan.",
      centerKicker: "Virtual contact center",
      centerTitle: "Give busy teams a clearer way to handle calls.",
      centerBody: "Organize shared calls with ring groups, queues and reporting on eligible plans.",
      centerPoints: ["Ring groups and call transfers", "Call queues", "Call reporting"],
      centerLink: "Explore Team plans",
      centerHref: "/pricing",
      numbersKicker: "Numbers & porting",
      numbersTitle: "A new number. Or the one your customers know.",
      newNumberTitle: "Get a business number",
      newNumberBody: "Search available numbers and review rental and applicable charges before purchase.",
      newNumberCta: "Explore business numbers",
      newNumberHref: "/account/register",
      keepNumberTitle: "Bring your existing number",
      keepNumberBody: "Submit transfer details and documents, then track progress in your account.",
      keepNumberCta: "Learn about number transfers",
      keepNumberHref: "/account/porting",
      numbersFine: "Number availability, transfer eligibility and activation depend on carrier approval and service setup.",
      unsureTitle: "Not sure where to start?",
      unsureBody: "Describe your team and how you want calls handled. The setup assistant can suggest a configuration for you to review.",
      unsurePlaceholder: "We have four people and need shared calls with business hours...",
      unsureButton: "Find my setup",
      endTitle: "Build the phone setup your business needs.",
      endCta: "Compare plans",
      endHref: "/pricing",
      endSecondary: "Talk to us",
      endSecondaryHref: "/contact",
    },
  },
  "page.ai": {
    shown: {
      kicker: "AI receptionist",
      title: "A warm welcome.",
      titleAccent: "A clear next step.",
      lead: "Greet callers, answer approved business questions, take messages and connect people to your team.",
      primaryCta: "View AI-enabled plans",
      primaryHref: "/pricing",
      secondaryCta: "Talk to us",
      secondaryHref: "/contact",
      heroAlt: "A caller on the phone with the business",
      servicesTitle: "Five AI services. One SautiCall account.",
      servicesLead: "An administrator turns each service on, registers the models, and assigns a model to each job. Customers use only the services on their plan.",
      services: [
        { title: "Automated notifications", body: "Send an approved voice message. The recipient presses 1 to listen, 2 to decline, or 9 to stop future messages." },
        { title: "AI receptionist", body: "Answer inbound calls from the company's approved information and transfer or take a message." },
        { title: "Personal assistant", body: "Screen the owner's calls using the rules that owner saved." },
        { title: "Outbound assistant", body: "Hold a short, task-limited conversation with someone who already agreed to the call." },
        { title: "Setup assistant", body: "Turn a plain-language description into a phone-system proposal a person approves." },
      ],
      points: [
        { title: "Welcome callers", body: "A friendly, consistent greeting for every call." },
        { title: "Answer routine questions", body: "Share approved information about your business." },
        { title: "Capture messages", body: "Take messages with key details when needed." },
        { title: "Connect your team", body: "Transfer callers to the right person or department." },
      ],
      flowKicker: "See how a call can unfold",
      flowTitle: "Your business information and routing rules guide each step.",
      builtTitle: "Built around your business.",
      built: [
        { title: "Your approved answers", body: "Use your business information to answer common questions." },
        { title: "Your transfer destinations", body: "Send callers to the right person or department." },
        { title: "Your message preferences", body: "Choose what details to capture when a message is taken." },
      ],
      chooseTitle: "You choose how it answers.",
      chooseBody: "Configure the greeting, approved information and transfer rules from your SautiCall account.",
      choosePoints: ["Customize your greeting", "Choose where calls are transferred", "Set after-hours behavior"],
      languageTitle: "Help callers in supported languages.",
      languageBody: "Check available languages and plan eligibility before choosing your setup.",
      languageLink: "Ask about language support →",
      languageHref: "/pricing",
      stepsTitle: "From setup to your first test call.",
      steps: [
        { title: "Choose an AI-enabled plan", body: "Select a plan that includes the AI receptionist." },
        { title: "Add your business information", body: "Provide your approved answers and details." },
        { title: "Set transfer and message rules", body: "Choose where to transfer calls and what to capture." },
        { title: "Test before activation", body: "Make a test call to confirm the experience." },
      ],
      stepsFine: "An active number and completed service setup are required for live calls.",
      finderTitle: "Find the right AI-enabled plan.",
      finderTeam: "Team size",
      finderLanguage: "Preferred caller language",
      finderButton: "See matching plans",
      reviewTitle: "Review your recommendation",
      reviewBody: "Compare included features, usage allowances and total pricing before you continue.",
      reviewLink: "Already a customer? Sign in to configure →",
      reviewHref: "/account/login",
      faqTitle: "Frequently asked questions.",
      faqs: [
        { q: "Can callers speak to a person?", a: "Yes. The receptionist can transfer the call to a person, an extension, or a ring group you set up." },
        { q: "What information can the receptionist answer from?", a: "It answers from the business information you save, such as hours, services, and the approved answers on the account." },
        { q: "What happens outside business hours?", a: "After hours, the receptionist follows the message and routing you set. It can take a message or send the call to voicemail." },
        { q: "Which languages are supported?", a: "Any-language understanding is included only on plans where that feature is turned on." },
        { q: "Which plans include the AI receptionist?", a: "Small Business and Team include it when that feature is turned on for the plan." },
      ],
      endTitle: "Give your callers a better first hello.",
      endCta: "View plans",
      endHref: "/pricing",
      endSecondary: "Talk to us",
      endSecondaryHref: "/contact",
    },
  },
  "page.how": {
    shown: {
      kicker: "How it works",
      title: "Tell us what you need. We'll set it up with you.",
      lead: "Describe the calls you want handled. Review a real plan, create your account, and connect a number and your team.",
      primaryCta: "Start with the assistant",
      primaryHref: "#assistant",
      secondaryCta: "Compare plans",
      secondaryHref: "/pricing",
      stepsTitle: "Four steps from the first description to a working line.",
      steps: [
        { title: "Tell us what you need", body: "How many people answer calls, where those calls should go, and whether you want the AI receptionist." },
        { title: "Review the suggested plan", body: "See the people, outbound minutes, and features on the plan that matches what you described." },
        { title: "Create your account and pay", body: "You review the monthly price first. The plan starts after that payment is confirmed." },
        { title: "Connect a number and your team", body: "Choose a new number or transfer one you already use, then add the people who answer." },
      ],
      assistKicker: "Setup assistant",
      assistTitle: "Describe the phone system in everyday language.",
      assistBody: "The assistant matches your description to a published plan. You still review the price and features before you pay.",
      cards: [
        { title: "You review it first", body: "The suggested plan, minutes, and features are the ones on the pricing page. Nothing is charged until you confirm payment." },
        { title: "Requests stay in your account", body: "Number orders and transfers show their status. A person steps in when a carrier step needs one." },
        { title: "Then add your team", body: "After the plan is paid, add the people who answer. Each person gets an extension on your phone system." },
      ],
      endTitle: "Ready to set up your business calls?",
      endCta: "Get started",
      endHref: "/account/register",
      endSecondary: "Talk to us",
      endSecondaryHref: "/contact",
    },
  },
  "page.pricing": {
    shown: {
      note: "Desk phone support means a compatible phone can be connected. The phone itself is not included in the monthly price.",
      ribbon: "Best for most teams",
      customTitle: "Need a different setup?",
      customBody: "Discuss team size, call handling and specific requirements.",
      customCta: "Request a custom quote",
      customHref: "/custom",
      compareTitle: "Compare what's included.",
      comparePeople: "People",
      compareMinutes: "Outbound minutes per plan period",
      compareSoftphone: "Softphone access",
      compareVoicemail: "Voicemail & forwarding",
      compareDesk: "Desk phone support",
      compareHours: "Business hours & ring groups",
      compareAi: "AI receptionist",
      compareQueues: "Call queues",
      compareReporting: "Call reporting",
      compareFeature: "Feature",
      costTitle: "Understand the full cost.",
      costs: [
        { title: "Business numbers", body: "Number rental and any setup charges are shown when selecting a number." },
        { title: "Emergency calling", body: "Applicable emergency registration or recurring charges must be disclosed before purchase." },
        { title: "AI usage & languages", body: "Review supported languages, usage allowances and any additional AI charges." },
        { title: "Taxes & calling rates", body: "Review taxes, eligible destinations and charges outside included allowances." },
      ],
      bundlesTitle: "Need more outbound minutes?",
      bundlesFine: "Bought minutes last until they are used.",
      bundlesLink: "Sign in to manage minutes",
      bundlesHref: "/account/login",
      finderTitle: "Not sure which plan fits?",
      finderBody: "Tell us a bit about your needs and we'll suggest a plan.",
      finderTeam: "Team size",
      finderAi: "I need AI call answering",
      finderButton: "Find a suitable plan",
      finderFine: "Review the recommendation before continuing.",
      faqTitle: "Frequently asked questions.",
      faqs: [
        { q: "Is this price per account or per person?", a: "The monthly price is for the account. It covers the number of people listed on that plan." },
        { q: "Are phone numbers and desk phones included?", a: "The plan includes the calling features listed on the card. A business number has its own rental, and a desk phone is not included in the monthly price." },
        { q: "How do included and purchased minutes work?", a: "Each plan includes outbound minutes for the billing period. Extra minutes can be bought as bundles and last until they are used." },
        { q: "What AI usage and languages are included?", a: "The AI receptionist is included on plans that list it. Any-language understanding is included only when that feature is turned on for the plan." },
        { q: "How do upgrades and downgrades affect billing?", a: "Changing plans starts a new payment for that plan’s monthly price. The account uses the new plan after the payment is confirmed." },
      ],
      endTitle: "Let's find the right plan for your team.",
      endCta: "Talk to us",
      endHref: "/contact",
      endSecondary: "Explore solutions",
      endSecondaryHref: "/solutions",
      blurbs: [
        { name: "Solo", text: "For one-person businesses." },
        { name: "Small Business", text: "For small teams." },
        { name: "Team", text: "For busier teams." },
      ],
      inherit: "Everything in Small Business",
      queues: "Call queues",
      reporting: "Call reporting",
      desk: "Desk phones",
      deskSupport: "Desk phone support",
      hours: "Business hours",
      rings: "Ring groups",
      ai: "AI receptionist",
      softphone: "Softphones",
      voicemail: "Voicemail & forwarding",
      peopleOne: "1 person",
      peopleMany: "Up to {count} people",
      minutes: "{count} outbound minutes",
      minutesPeriod: "{count} outbound minutes per plan period",
      month: "/ month",
      verb: "Explore",
      homeVerb: "Choose",
    },
  },
  "page.account": {
    shown: {
      loginKicker: "Sign in",
      loginHeadline: "Your business calls.",
      loginHeadlineAccent: "All together.",
      loginLead: "Manage your numbers, team and call handling in one place.",
      loginHeading: "Welcome back",
      loginBody: "Sign in to your SautiCall account.",
      loginSubmit: "Sign in",
      loginEmail: "Email address",
      loginEmailHint: "you@business.com",
      loginPassword: "Password",
      loginPasswordHint: "Enter your password",
      loginNew: "New to SautiCall?",
      loginNewLink: "Create an account",
      loginTrouble: "Having trouble signing in?",
      loginTroubleLink: "Contact support",
      registerKicker: "Create account",
      registerHeadline: "Your next business",
      registerHeadlineAccent: "call starts here.",
      registerLead: "Bring your numbers, team and call handling together with SautiCall.",
      registerPoints: ["One account for your business", "Guided setup for your team", "Review your plan before payment"],
      registerHeading: "Let's get you started",
      registerBody: "Create your SautiCall account. Next, review your plan and payment details.",
      registerSubmit: "Create account →",
      registerName: "Full name",
      registerNameHint: "Your full name",
      registerEmail: "Email address",
      registerEmailHint: "you@business.com",
      registerPhone: "Mobile number",
      registerPhoneHint: "+1 202 555 0100",
      registerPassword: "Password",
      registerPasswordHint: "Create a password",
      registerTerms: "I agree to the Terms of Service.",
      registerPasswordRule: "Password must be at least 8 characters.",
      registerExisting: "Already have an account?",
      registerExistingLink: "Sign in",
      registerQuestions: "Questions before you start?",
      registerQuestionsLink: "Contact us",
      authBack: "Back to website →",
      authHelp: "Need help?",
      authStepAccount: "Account",
      authStepPlan: "Plan & payment",
      codeLabel: "Code from the app",
      codeSubmit: "Confirm code",
    },
  },
  "page.help": {
    metaTitle: "Help · SautiCall",
    metaDescription: "Answers about numbers, calling, plans, and your SautiCall account.",
    shown: {
      kicker: "Help & FAQ",
      title: "Find the answer. Get back to business.",
      lead: "Explore common questions about numbers, calling, plans and your account.",
      searchLabel: "Search questions",
      searchPlaceholder: "Search questions, topics or keywords...",
      popular: "Popular topics:",
      topicsTitle: "Browse topics",
      questionsTitle: "Common questions",
      questionsLead: "Browse by topic or search above.",
      empty: "No questions match that search.",
      sideTitle: "Need account-specific help?",
      sideBody: "Sign in to create or follow a support ticket.",
      sideCta: "Sign in for support",
      sideHref: "/account/login",
      topics: [
        { id: "all", label: "All questions" },
        { id: "started", label: "Getting started" },
        { id: "numbers", label: "Numbers & transfers" },
        { id: "phone", label: "Phone system & devices" },
        { id: "ai", label: "AI receptionist" },
        { id: "billing", label: "Plans & minutes" },
        { id: "voicemail", label: "Voicemail" },
        { id: "account", label: "Account & security" },
      ],
      chips: [
        { id: "numbers", label: "Number transfers" },
        { id: "billing", label: "Call minutes" },
        { id: "ai", label: "AI receptionist" },
      ],
      guide: [
        { title: "How do I get started with SautiCall?", body: "Compare plans or use the setup assistant to find a configuration. Create your account, connect a number, add your team, and place a test call once service is active.", href: "/how-it-works", topic: "started", link: "See how it works →" },
        { title: "Can I keep my existing business number?", body: "Yes. Start a number transfer from your account and follow each step. The team steps in when a transfer needs a person.", href: "/account/porting", topic: "numbers", link: "Read more →" },
        { title: "Can I use desk phones and mobile apps?", body: "Yes. A compatible desk phone can be connected, and the phone app works on a computer or mobile phone.", href: "/solutions#phones", topic: "phone", link: "Read more →" },
        { title: "Which plans include the AI receptionist?", body: "The receptionist is included on the plans that list it. On the published plans, that is Small Business and Team.", href: "/pricing", topic: "ai", link: "Read more →" },
        { title: "Where can I check my remaining minutes?", body: "Sign in and open Calls & voicemail. The page shows the minutes included with your plan and how many are left.", href: "/account/minutes", topic: "billing", link: "Compare plans →" },
        { title: "Can I buy extra call minutes?", body: "Yes. From Calls & voicemail you can buy a minute bundle. Bought minutes last until they are used.", href: "/account/minutes", topic: "billing", link: "Compare plans →" },
        { title: "How do I set up my voicemail greeting?", body: "Each extension has a mailbox. Greetings and messages stay in the phone app.", href: "/account/minutes", topic: "voicemail", link: "Read more →" },
        { title: "How do I enable two-factor authentication?", body: "Open Settings, then Security, and scan the code with an authenticator app.", href: "/account/security", topic: "account", link: "Read more →" },
        { title: "How do I get help with my account?", body: "Sign in and open a support ticket, or contact us for a general question.", href: "/account/tickets", topic: "account", link: "Read more →" },
      ],
      jumps: [
        { title: "New to SautiCall?", body: "Learn the basics and get set up in a few simple steps.", href: "/how-it-works", link: "Read the setup guide →" },
        { title: "Choosing a plan?", body: "Compare features and find the right plan for your business.", href: "/pricing", link: "Compare plans →" },
        { title: "Need to talk?", body: "Have a question we didn't cover? We're here to help.", href: "/contact", link: "Contact us →" },
      ],
      askTitle: "Still have a question?",
      askBody: "Contact us for general questions, or sign in for help with your account.",
      askCta: "Contact us",
      askHref: "/contact",
      askSecondary: "Sign in for support",
      askSecondaryHref: "/account/login",
      articleEyebrow: "FAQ",
      articleBack: "All articles",
    },
  },
};

export const solutionsMenu = [
  { label: "Phone system", href: "/solutions#phone", location: "menu" as const, group: "solutions" },
  { label: "Desk & mobile", href: "/solutions#phones", location: "menu" as const, group: "solutions" },
  { label: "AI receptionist", href: "/ai-receptionist", location: "menu" as const, group: "solutions" },
  { label: "Contact center", href: "/solutions#center", location: "menu" as const, group: "solutions" },
  { label: "Numbers & porting", href: "/solutions#numbers", location: "menu" as const, group: "solutions" },
];

function shownOf(page: Record<string, unknown>) {
  const shown = page.shown;
  return shown && typeof shown === "object" && !Array.isArray(shown) ? (shown as Record<string, unknown>) : {};
}

export function line(page: Record<string, unknown>, key: string, fallback = "") {
  const value = shownOf(page)[key] ?? page[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}

export function textList(page: Record<string, unknown>, key: string, fallback: string[]) {
  const value = shownOf(page)[key];
  if (!Array.isArray(value)) return fallback;
  const rows = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return rows.length ? rows : fallback;
}

export function rows(page: Record<string, unknown>, key: string, fallback: Record<string, string>[]) {
  const value = shownOf(page)[key];
  if (!Array.isArray(value)) return fallback;
  const next = value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    .map((item) => Object.fromEntries(Object.entries(item).map(([name, cell]) => [name, typeof cell === "string" ? cell : ""])));
  return next.length ? next : fallback;
}

export function faqsOf(page: Record<string, unknown>, fallback: { q: string; a: string }[]) {
  return rows(page, "faqs", fallback).map((item) => ({ q: item.q || "", a: item.a || "" })).filter((item) => item.q && item.a);
}

export function copyFaqs(page: Record<string, unknown>, docKey: string) {
  return faqsOf(page, copyRows(page, docKey, "faqs").map((item) => ({ q: item.q || "", a: item.a || "" })));
}

function shownDefault(key: string) {
  const shown = liveCopy[key]?.shown;
  return shown && typeof shown === "object" && !Array.isArray(shown) ? (shown as Record<string, unknown>) : {};
}

export function nestedDefault(key: string, field: string) {
  const value = shownDefault(key)[field];
  return typeof value === "string" ? value : "";
}

export function copyLine(page: Record<string, unknown>, docKey: string, field: string) {
  return line(page, field, nestedDefault(docKey, field));
}

export function copyRows(page: Record<string, unknown>, docKey: string, field: string) {
  const value = shownDefault(docKey)[field];
  const fallback = Array.isArray(value) ? (value as Record<string, string>[]) : [];
  return rows(page, field, fallback);
}

export function copyTexts(page: Record<string, unknown>, docKey: string, field: string) {
  const value = shownDefault(docKey)[field];
  const fallback = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  return textList(page, field, fallback);
}

export function mergeMissingDeep(current: unknown, extras: unknown): boolean {
  if (!extras || typeof extras !== "object" || Array.isArray(extras)) return false;
  if (!current || typeof current !== "object" || Array.isArray(current)) return false;
  let changed = false;
  for (const [key, value] of Object.entries(extras as Record<string, unknown>)) {
    const slot = (current as Record<string, unknown>)[key];
    if (slot === undefined) {
      (current as Record<string, unknown>)[key] = typeof value === "object" && value ? structuredClone(value) : value;
      changed = true;
    } else if (value && typeof value === "object" && !Array.isArray(value) && slot && typeof slot === "object" && !Array.isArray(slot)) {
      if (mergeMissingDeep(slot, value)) changed = true;
    }
  }
  return changed;
}
