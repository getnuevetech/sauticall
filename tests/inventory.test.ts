import assert from "node:assert/strict";
import test from "node:test";
import { clientEmail, clientPhone, clientPlace, personName, readVoipClientId } from "../lib/client-profile.ts";
import { customerMessage, customerRequestStatus } from "../lib/customer-message.ts";
import { didMatches, parseDigitSearch } from "../lib/did-search.ts";
import { didInfoIsAbsent, lookupMayOrder, normalizeRequestedDid, readDids } from "../lib/did-list.ts";
import { balanceCovers, planFundAmount, readClientBalance, resellerOrderFees } from "../lib/client-funding.ts";
import { carrierDidRef, customerLineStatus, customerNumberStatus, numberIsBought, numberPurchaseMode } from "../lib/number-order.ts";
import { nextOutboundPriority, outboundRuleBody, outboundScopeVerdict } from "../lib/outbound-rule.ts";
import { trunkContentTypes, trunkCreateBody, trunkDeltaBody, trunkDeltaLists, trunkFilledDeltas, trunkGroupBody, trunkPostBody, trunkReplayBody, trunkServiceBody, trunkShape, trunkSmallBody } from "../lib/trunk-body.ts";
import { assignBlocks, chooseExtension, extensionPlanError, extensionPlanFromFields, extensionRange, keptRange, normalizeExtensionPlan, replacementExtension } from "../lib/extension-numbers.ts";
import { idFromPbx } from "../lib/pbx-id.ts";
import { describeExtensionFailure, numberAlreadyUsed, pbxAccessMessage, pbxErrorText, roleFromToken } from "../lib/pbx-access.ts";
import { extensionAddedNoticeIsOn, extensionWelcomeText, webClientUrl, welcomeCustomerNote } from "../lib/extension-welcome.ts";
import { mfaIsRequired } from "../lib/mfa-rules.ts";
import { DEPARTMENT_NAME_RULES, acceptedDepartmentName, departmentCreateBody, departmentNameIssue, departmentNameTakenMessage, departmentRejectedMessage, userCreateBody } from "../lib/pbx-user.ts";
import { readRateCenters, regionAllowed } from "../lib/places.ts";

test("a DID that is not on the account yet is absent, not a failed check", () => {
  assert.equal(didInfoIsAbsent("invalid_did"), true);
  assert.equal(didInfoIsAbsent("no_did"), true);
  assert.equal(didInfoIsAbsent("invalid_credentials"), false);
  assert.equal(didInfoIsAbsent("success"), false);
});

test("a timed-out ownership check still allows the number to be ordered", () => {
  assert.equal(lookupMayOrder({ ok: false, owned: false, status: "unreachable" }), true);
  assert.equal(lookupMayOrder({ ok: true, owned: false, status: "invalid_did" }), true);
  assert.equal(lookupMayOrder({ ok: true, owned: true, status: "success" }), false);
  assert.equal(lookupMayOrder({ ok: false, owned: false, status: "invalid_credentials" }), false);
});

test("a number request has to be a full 10-digit inventory number", () => {
  assert.equal(normalizeRequestedDid("832"), "");
  assert.equal(normalizeRequestedDid("A Houston local number"), "");
  assert.equal(normalizeRequestedDid("(832) 555-0100"), "8325550100");
  assert.equal(normalizeRequestedDid("1-832-555-0100"), "8325550100");
  assert.equal(normalizeRequestedDid("0125550100"), "");
});

test("inventory results keep real DIDs and can return the whole list", () => {
  const body = { dids: [{ did: "8325550100", ratecenter: "HOUSTON", state: "TX", perminute_monthly: "0.85" }, { did: "832" }, "not-a-number"] };
  assert.deepEqual(readDids(body, 20), [{ did: "8325550100", ratecenter: "HOUSTON", state: "TX", monthly: "0.85" }]);
  const many = { dids: Array.from({ length: 25 }, (_, index) => ({ did: `832555${String(index).padStart(4, "0")}` })) };
  assert.equal(readDids(many, 20).length, 20);
  assert.equal(readDids(many, 0).length, 25);
  assert.deepEqual(readDids({ dids: { did: "3612267988", ratecenter: "HOUSTON", state: "TX" } }, 0), [{ did: "3612267988", ratecenter: "HOUSTON", state: "TX", monthly: "" }]);
});

test("number buying is manual until automatic buying is switched on", () => {
  assert.equal(numberPurchaseMode(false, false), "off");
  assert.equal(numberPurchaseMode(false, true), "off");
  assert.equal(numberPurchaseMode(true, false), "manual");
  assert.equal(numberPurchaseMode(true, true), "automatic");
  assert.equal(customerNumberStatus("ordered", "", "3612267988"), "Needs attention");
  assert.equal(customerNumberStatus("completed", "", "3612267988"), "Needs attention");
  assert.equal(customerNumberStatus("ordered", carrierDidRef("3612267988"), "3612267988"), "Bought");
  assert.equal(customerNumberStatus("ordering", "", "3612267988"), "Buying");
  assert.equal(numberIsBought("ordered", "voipms:3612267988", "1-361-226-7988"), true);
  assert.equal(numberIsBought("ordered", "voipms:2393827119", "3612267988"), false);
});

test("a number search can target the whole number, its start, or its end", () => {
  const exact = parseDigitSearch("number", "(713) 555-0100");
  const prefix = parseDigitSearch("prefix", "713");
  const suffix = parseDigitSearch("suffix", "0100");
  assert.equal(exact.ok && exact.search.query, "7135550100");
  assert.equal(prefix.ok && didMatches("7135550199", prefix.search), true);
  assert.equal(prefix.ok && didMatches("8325550199", prefix.search), false);
  assert.equal(suffix.ok && didMatches("2815550100", suffix.search), true);
  assert.equal(parseDigitSearch("prefix", "71").ok, false);
  assert.equal(parseDigitSearch("number", "713555").ok, false);
});

test("a VoIP.ms client stays tied to the SautiCall customer", () => {
  assert.deepEqual(personName("Ada Customer"), { first: "Ada", last: "Customer" });
  assert.equal(clientEmail(12, "ada@example.com", "clients.example.com"), "customer-12@clients.example.com");
  assert.equal(clientEmail(12, "ada@example.com", ""), "ada@example.com");
  assert.equal(clientPlace({}).state, "TX");
  assert.equal(clientPlace({}).phone, "7135550100");
  assert.equal(clientPlace({ emergency: { country: "US", state: "TX", city: "HOUSTON", address: "1200 Main", zip: "77002" } }).city, "HOUSTON");
  assert.equal(clientPhone("+1 (202) 555-0199"), "2025550199");
  const customer = clientPlace({ customer: { country: "US", state: "TX", city: "HOUSTON", address: "15211 Park Row", zip: "77084", phone: "+1 202 555 0199" } });
  assert.equal(customer.address, "15211 Park Row");
  assert.equal(customer.phone, "2025550199");
  assert.equal(clientPlace({ customer: { phone: "2025550199" }, fallback: { phone: "7135550100" } }).phone, "2025550199");
  assert.equal(readVoipClientId({ client: 561115 }), "561115");
  assert.equal(readVoipClientId({ clients: [{ client: 42, email: "a@b.c" }] }), "42");
});

test("state and city lists reject a typed code that is not a real place", () => {
  assert.equal(regionAllowed("US", "TX"), true);
  assert.equal(regionAllowed("US", "Texas"), false);
  assert.equal(regionAllowed("CA", "ON"), true);
  assert.equal(regionAllowed("US", "ON"), false);
  assert.deepEqual(readRateCenters({ ratecenters: [{ ratecenter: "HOUSTON" }, { ratecenter: "AUSTIN" }, "DALLAS"] }), ["AUSTIN", "DALLAS", "HOUSTON"]);
});

test("an admin sees the precise 3CX error and whether the extension exists", () => {
  const refused = describeExtensionFailure({
    number: "122",
    status: 403,
    code: "",
    detail: "Access denied.",
    role: "users",
    lookupFailed: "3CX returned 403: Access denied.",
  });
  assert.match(refused, /could not check whether extension 122 already exists/);
  assert.match(refused, /3CX returned 403: Access denied\./);
  assert.match(refused, /System Owner/);
  const taken = describeExtensionFailure({
    number: "122",
    status: 400,
    code: "ALREADY_IN_USE",
    detail: "The number is already in use.",
    role: "",
    existing: { email: "other@example.com" },
  });
  assert.match(taken, /Extension 122 already exists on 3CX for other@example.com/);
  assert.match(taken, /3CX returned 400 \(ALREADY_IN_USE\): The number is already in use\./);
  const missing = describeExtensionFailure({
    number: "500",
    status: 400,
    code: "",
    detail: "Number is outside the department range.",
    role: "",
    existing: null,
  });
  assert.match(missing, /Extension 500 was not found on 3CX/);
  assert.match(missing, /Number is outside the department range/);
});

test("a 403 from 3CX names the API role that was refused", () => {
  const users = Buffer.from(JSON.stringify({ role: ["App", "Local", "SingleCompany"], MaxRole: "users" })).toString("base64url");
  assert.equal(roleFromToken(`aa.${users}.zz`), "users");
  const appOnly = Buffer.from(JSON.stringify({ role: ["App", "Local", "Paid", "Enterprise", "CallFlowApp"] })).toString("base64url");
  assert.equal(roleFromToken(`aa.${appOnly}.zz`), "");
  const owner = Buffer.from(JSON.stringify({ role: ["App"], MaxRole: "system_owners" })).toString("base64url");
  assert.equal(roleFromToken(`aa.${owner}.zz`), "system_owners");
  assert.match(pbxAccessMessage(403, "users", "Access denied."), /System Owner/);
  assert.match(pbxAccessMessage(403, "owners", "Access denied."), /Owner is the department role/);
  assert.match(pbxAccessMessage(403, "", ""), /no System Owner role/);
  assert.match(pbxAccessMessage(403, "", ""), /Configuration API Access/);
  assert.match(pbxAccessMessage(403, "system_owners", ""), /Allow access from everywhere/);
});

test("extension numbers start at 2000 and skip numbers already taken", () => {
  assert.deepEqual(extensionRange(1), { from: 2000, to: 2009 });
  assert.deepEqual(extensionRange(3), { from: 2020, to: 2029 });
  assert.equal(chooseExtension(1, ["2000"], [1]), "2001");
  const ownBlock = Array.from({ length: 10 }, (_, index) => String(2000 + index));
  assert.equal(chooseExtension(1, ownBlock, [1, 2]), "2020");
  assert.equal(chooseExtension(1, [...ownBlock, "2020"], [1, 2, 3]), "2030");
});

test("an admin extension plan replaces the built-in start and block", () => {
  const plan = { start: 3000, block: 5, span: 100, ringStart: 800, queueStart: 900, groupSpan: 50 };
  assert.deepEqual(extensionRange(1, plan), { from: 3000, to: 3004 });
  assert.deepEqual(extensionRange(2, plan), { from: 3005, to: 3009 });
  assert.equal(chooseExtension(1, ["3000", "3001", "3002", "3003", "3004"], [1, 2], plan), "3010");
  assert.equal(extensionPlanError(plan), "");
  assert.match(extensionPlanError({ ...plan, start: 800 }), /different starting numbers/);
  assert.match(extensionPlanError({ ...plan, block: 0 }), /between 1 and 500/);
  const saved = extensionPlanFromFields({ start: "4100", block: "20", span: "200", ringStart: "700", queueStart: "750", groupSpan: "40" });
  assert.equal(saved.ok && saved.plan.start, 4100);
  assert.equal(saved.ok && saved.plan.block, 20);
  assert.equal(normalizeExtensionPlan({ start: "nope" }).start, 2000);
});

test("each plan reserves its own extension count, and an existing range stays put", () => {
  const ranges = assignBlocks(510, [
    { id: 1, seats: 1 },
    { id: 2, seats: 5 },
    { id: 3, seats: 10 },
  ]);
  assert.deepEqual(ranges, [
    { id: 1, from: 510, to: 510 },
    { id: 2, from: 511, to: 515 },
    { id: 3, from: 516, to: 525 },
  ]);
  const kept = assignBlocks(510, [
    { id: 1, seats: 1, from: 510, to: 514, locked: true },
    { id: 2, seats: 10 },
  ]);
  assert.deepEqual(kept[0], { id: 1, from: 510, to: 514 });
  assert.deepEqual(kept[1], { id: 2, from: 515, to: 524 });
  const plan = { start: 510, block: 5, span: 100, ringStart: 100, queueStart: 101, groupSpan: 10 };
  assert.equal(chooseExtension(2, [], [], plan, kept), "515");
  assert.equal(chooseExtension(1, ["510", "511", "512", "513", "514"], [], plan, kept), "525");
  const grown = assignBlocks(510, [{ id: 1, seats: 10, from: 510, to: 514 }]);
  assert.deepEqual(grown, [{ id: 1, from: 510, to: 519 }]);
});

test("a starting number of 500 skips extensions already used below it", () => {
  assert.equal(keptRange(500, 100, 123), undefined);
  assert.deepEqual(keptRange(500, 510, 514), { from: 510, to: 514 });
  assert.deepEqual(keptRange(500, 490, 510), { from: 500, to: 510 });
  const plan = { start: 500, block: 5, span: 50, ringStart: 800, queueStart: 900, groupSpan: 20 };
  const ranges = assignBlocks(500, [{ id: 3, seats: 5 }]);
  assert.deepEqual(ranges, [{ id: 3, from: 500, to: 504 }]);
  assert.equal(replacementExtension("122", 500, ["122", "123"], 3, ranges, plan), "500");
  assert.equal(chooseExtension(3, ["122", "123", "500"], [], plan, ranges), "501");
  assert.equal(replacementExtension("501", 500, ["122"], 3, ranges, plan), "501");
  assert.equal(chooseExtension(1, ["122", "123", "124"], [], plan, [{ id: 1, from: 120, to: 600 }]), "500");
});

test("a 3CX reply that the number is already used counts as a collision", () => {
  const error = pbxErrorText({
    Message: "The request is invalid.",
    ModelState: { "user.Number": ["Number '124' is already used."] },
  }, "");
  assert.match(error.message, /user\.Number: Number '124' is already used/);
  const delta = pbxErrorText({
    error: { message: "The input was not valid.", details: [{ target: "Gateway.InboundParams.delta", message: "The delta field is required." }] },
  }, "");
  assert.match(delta.message, /Gateway\.InboundParams\.delta: The delta field is required/);
  assert.equal(numberAlreadyUsed(error.code, error.message, 400), true);
  assert.equal(numberAlreadyUsed("", "The extension number is already assigned to another user."), true);
  assert.equal(numberAlreadyUsed("ALREADY_IN_USE", ""), true);
  assert.equal(numberAlreadyUsed("", "", 409), true);
  assert.equal(numberAlreadyUsed("", "Access denied", 403), false);
  const message = describeExtensionFailure({
    number: "124",
    status: 400,
    code: error.code,
    detail: error.message,
    role: "system_owners",
    existing: null,
  });
  assert.match(message, /Extension 124 already exists on 3CX/);
});

test("an extension welcome explains 3CX sign-in and keeps the app password off the email", () => {
  const text = extensionWelcomeText({ firstName: "Abiola", number: "514", email: "aoolomola@gmail.com", webClient: webClientUrl("https://pbx.example.com/") });
  assert.match(text, /extension is 514/);
  assert.match(text, /https:\/\/pbx\.example\.com\/webclient/);
  assert.match(text, /3CX phone app/);
  assert.match(text, /desk phone/);
  assert.match(text, /SautiCall support/);
  assert.match(text, /buy a business number/i);
  assert.match(text, /inbound and outbound calls/);
  assert.equal(text.includes("u2dPtRSyZ"), false);
  assert.equal(welcomeCustomerNote(true), "A setup email was sent to this address.");
  assert.match(welcomeCustomerNote(false), /could not be sent/);
  assert.equal(extensionAddedNoticeIsOn({ NotifyExtensionAdded: true }), true);
  assert.equal(extensionAddedNoticeIsOn({ value: [{ NotifyExtensionAdded: false }] }), false);
  assert.equal(extensionAddedNoticeIsOn(null), true);
  assert.equal(mfaIsRequired(false, 0), false);
  assert.equal(mfaIsRequired(false, 1), true);
  assert.equal(mfaIsRequired(true, 0), true);
});

test("a company name follows the department rules before it is sent", () => {
  assert.equal(departmentNameIssue("Kwik Tech"), "");
  assert.equal(acceptedDepartmentName("  Kwik   Tech "), "Kwik Tech");
  assert.equal(departmentNameIssue("3CX Test"), "");
  assert.equal(departmentNameIssue("AT&T (West)"), "");
  assert.match(departmentNameIssue(""), /company name/);
  assert.match(departmentNameIssue("DEFAULT"), /DEFAULT/);
  assert.match(departmentNameIssue("default"), /DEFAULT/);
  assert.match(departmentNameIssue("O'Brien"), /apostrophes/);
  assert.match(departmentNameIssue("SautiCall 4"), /company name/);
  assert.match(departmentNameIssue("a".repeat(51)), /50/);
  assert.match(departmentNameIssue("Acme/West"), /apostrophes/);
  assert.match(departmentNameTakenMessage("Kwik Tech"), /already a department/);
  assert.match(departmentRejectedMessage("Kwik Tech"), /did not accept "Kwik Tech"/);
  assert.match(DEPARTMENT_NAME_RULES, /People are added to that department/);
  assert.equal(acceptedDepartmentName("SautiCall 9"), "");
});

test("a new department and person match the 3CX user shape", () => {
  const department = departmentCreateBody("Kwik Tech", 500, 509);
  assert.equal(department.Name, "Kwik Tech");
  assert.equal(department.Props.UserNumberFrom, "500");
  assert.equal(department.Props.UserNumberTo, "509");
  assert.equal("UserNumberFrom" in department, false);
  const person = userCreateBody({
    firstName: "Agbo",
    lastName: "Ola",
    email: "sales@kwiktech.net",
    number: "515",
    password: "secret",
    groupId: 12,
  });
  assert.equal(person.Number, "515");
  assert.deepEqual(person.Groups, [{ GroupId: 12, Rights: { RoleName: "users" } }]);
  assert.equal(JSON.stringify(person).includes("@odata.type"), false);
});

test("a customer never sees a partner or integration error", () => {
  const hidden = "3CX signed this client in as App, then refused the call. In 3CX Admin, open Integrations, then API.";
  assert.equal(customerMessage(hidden, "We could not finish this yet. The team has the details."), "We could not finish this yet. The team has the details.");
  assert.equal(customerMessage("VoIP.ms rejected the API login.", "The number list is not available right now."), "The number list is not available right now.");
  assert.equal(customerMessage("Stripe did not start checkout.", "Payment could not be started."), "Payment could not be started.");
  assert.equal(customerMessage("Choose a city from the list.", "Try again."), "Choose a city from the list.");
  assert.equal(
    customerMessage("The query specified in the URI is not valid. The limit of '100' for Top query has been exceeded. The value from the incoming request is '500'.", "We could not add this person yet. Please try again, or contact support."),
    "We could not add this person yet. Please try again, or contact support.",
  );
  assert.equal(customerRequestStatus("exception"), "Needs attention");
  assert.equal(customerRequestStatus("ordered"), "Bought");
});

test("opening balances match the plan, and an outbound rule stays limited to that customer", () => {
  assert.equal(planFundAmount(5), 5);
  assert.equal(planFundAmount("10.5"), 10.5);
  assert.equal(planFundAmount(0), 0);
  assert.equal(planFundAmount(-3), 0);
  assert.equal(planFundAmount("nope"), 0);
  assert.equal(readClientBalance({ balance: "12.50" }), 12.5);
  assert.equal(readClientBalance({ status: "success", balance: { current_balance: "8.0588", spent_total: "1.9012" } }), 8.0588);
  assert.equal(readClientBalance({ balance: { spent_total: "1" } }), null);
  assert.equal(readClientBalance({}), null);
  assert.deepEqual(resellerOrderFees({ chargeClient: true, monthly: "0.85" }), { monthly: "0.85", setup: "0.00", minute: "0.00" });
  assert.deepEqual(resellerOrderFees({ chargeClient: false, monthly: "0.85" }), { monthly: "0.00", setup: "0.00", minute: "0.00" });
  assert.equal(balanceCovers(5, { monthly: "0.85", setup: "0.00" }), true);
  assert.equal(balanceCovers(0, { monthly: "0.85", setup: "0.00" }), false);
  assert.equal(balanceCovers(null, { monthly: "0.85", setup: "0.00" }), true);
  const rule = outboundRuleBody({ name: "SautiCall 3612267988", trunkId: 4, callerId: "+13612267988", from: "514", to: "523", priority: 3 });
  assert.deepEqual(rule.DNRanges, [{ From: "514", To: "523" }]);
  assert.equal(rule.Routes[0].TrunkId, 4);
  assert.equal(nextOutboundPriority({ value: [{ Priority: 2 }, { Priority: 8 }] }), 9);
  assert.equal(outboundScopeVerdict(rule, "514", "523"), "scoped");
  assert.equal(outboundScopeVerdict({ DNRanges: [] }, "514", "523"), "open");
  assert.equal(outboundScopeVerdict({ Name: "SautiCall" }, "514", "523"), "unknown");
  assert.equal(customerLineStatus("ordered"), "Bought. Connecting this number for calls.");
  assert.equal(customerLineStatus("trunk_waiting"), "Bought. Connecting this number for calls still needs the team.");
  assert.equal(customerLineStatus("trunk_live"), "Connected for calls");
  const trunk = trunkCreateBody({
    seed: {
      "@odata.context": "https://pbx.example/xapi/v1/$metadata#Trunks/$entity",
      AuthPassword: { Value: "" },
      DidNumbers: { "@odata.context": "https://pbx.example/xapi/v1/$metadata#Collection(String)" },
      RoutingRules: { "@odata.type": "#Collection(Pbx.InboundRule)", delta: [{ RuleName: "Main" }] },
      Gateway: {
        TemplateFilename: "GenericSIPTrunk.pv.xml",
        Port: 5060,
        Lines: 2,
        InboundParams: { delta: [{ ParamId: 1, Custom: "$CalledNum" }] },
        OutboundParams: { "@odata.context": "https://pbx.example/xapi/v1/$metadata#Collection(Pbx.GatewayParameterBinding)" },
      },
    },
    name: "SautiCall 3612267988",
    number: "+1 (361) 226-7988",
    authId: "line-account",
    password: "secret",
    host: "houston1.voip.ms",
  });
  assert.equal("@odata.context" in trunk, false);
  assert.equal(trunk["@odata.type"], "#Pbx.Trunk");
  assert.equal((trunk.AuthPassword as { Value: string; "@odata.type": string }).Value, "secret");
  assert.equal((trunk.AuthPassword as { "@odata.type": string })["@odata.type"], "#Pbx.ConcealedPassword");
  assert.equal(trunk.ExternalNumber, "13612267988");
  assert.deepEqual(trunk.DidNumbers, ["13612267988"]);
  assert.equal("RoutingRules" in trunk, false);
  assert.equal("Groups" in trunk, false);
  const gateway = trunk.Gateway as {
    "@odata.type": string;
    Host: string;
    TemplateFilename: string;
    Lines: number;
    InboundParams: { "@odata.type": string; Custom: string }[];
  };
  assert.equal(gateway["@odata.type"], "#Pbx.Gateway");
  assert.equal(gateway.Host, "houston1.voip.ms");
  assert.equal(gateway.TemplateFilename, "GenericSIPTrunk.pv.xml");
  assert.equal(gateway.Lines, 2);
  assert.equal(gateway.InboundParams[0]["@odata.type"], "#Pbx.GatewayParameterBinding");
  assert.equal(gateway.InboundParams[0].Custom, "$CalledNum");
  assert.equal("OutboundParams" in gateway, false);
  const delta = trunkDeltaBody(trunk);
  assert.deepEqual(delta.DidNumbers, { "@odata.type": "#Collection(String)", delta: ["13612267988"] });
  assert.equal((delta.Gateway as { InboundParams: { delta: { Custom: string }[] } }).InboundParams.delta[0].Custom, "$CalledNum");
  assert.equal(trunkGroupBody(12).Groups[0].GroupId, 12);
  assert.equal(JSON.stringify(trunk).split("secret").length - 1, 1);
  const replay = trunkReplayBody({
    seed: {
      "@odata.context": "https://pbx.example/xapi/v1/$metadata#Trunks/$entity",
      "@odata.type": "#Pbx.Trunk",
      Id: 0,
      AuthPassword: { "@odata.type": "#Pbx.ConcealedPassword", Value: "" },
      DidNumbers: { "@odata.context": "https://pbx.example/xapi/v1/$metadata#Collection(String)" },
      RoutingRules: { "@odata.type": "#Collection(Pbx.InboundRule)", delta: [{ RuleName: "Main" }] },
      Gateway: {
        "@odata.type": "#Pbx.Gateway",
        TemplateFilename: "GenericSIPTrunk.pv.xml",
        Port: 5060,
        InboundParams: { "@odata.type": "#Collection(Pbx.GatewayParameterBinding)", delta: [{ ParamId: 1, Custom: "$CalledNum" }] },
        OutboundParams: { "@odata.context": "https://pbx.example/xapi/v1/$metadata#Collection(Pbx.GatewayParameterBinding)", delta: null },
      },
    },
    name: "SautiCall 3612267988",
    number: "+1 (361) 226-7988",
    authId: "line-account",
    password: "secret",
    host: "houston1.voip.ms",
    template: "GenericSIPTrunk.pv.xml",
  });
  assert.equal("@odata.context" in replay, false);
  assert.equal(replay["@odata.type"], "#Pbx.Trunk");
  assert.equal(replay.Id, 0);
  assert.equal((replay.RoutingRules as { delta: { RuleName: string }[] }).delta[0].RuleName, "Main");
  assert.deepEqual((replay.DidNumbers as { delta: string[] }).delta, ["13612267988"]);
  assert.deepEqual(replay.AuthPassword, { "@odata.type": "#Pbx.ConcealedPassword", Value: "secret" });
  const replayGateway = replay.Gateway as { Host: string; InboundParams: { delta: { Custom: string }[] }; OutboundParams: { delta: unknown[] } };
  assert.equal(replayGateway.Host, "houston1.voip.ms");
  assert.equal(replayGateway.InboundParams.delta[0].Custom, "$CalledNum");
  assert.deepEqual(replayGateway.OutboundParams.delta, []);
  assert.equal(JSON.stringify(replay).split("secret").length - 1, 1);
  assert.match(trunkShape(replay), /RoutingRules:delta\(1\)/);
  assert.match(trunkShape(replay), /Gateway\{/);
  assert.equal(trunkShape(replay).includes("secret"), false);
  const listed = trunkDeltaLists({
    DidNumbers: ["13612267988"],
    PublicInfoGroups: [],
    AuthPassword: { Value: "secret" },
    Gateway: { InboundParams: [{ ParamId: 1, Custom: "$CalledNum" }], Codecs: ["PCMU"], OutboundParams: [] },
  });
  assert.deepEqual(listed.DidNumbers, { delta: ["13612267988"] });
  assert.deepEqual(listed.PublicInfoGroups, { delta: [] });
  assert.deepEqual(listed.AuthPassword, { Value: "secret" });
  const listedGateway = listed.Gateway as { InboundParams: { delta: { Custom: string }[] }; Codecs: { delta: string[] }; OutboundParams: { delta: unknown[] } };
  assert.equal(listedGateway.InboundParams.delta[0].Custom, "$CalledNum");
  assert.deepEqual(listedGateway.Codecs.delta, ["PCMU"]);
  assert.deepEqual(listedGateway.OutboundParams.delta, []);
  const filled = trunkFilledDeltas({ DidNumbers: ["13612267988"], Tags: [], Gateway: { Codecs: ["PCMU"], OutboundParams: [] } });
  assert.equal("Tags" in filled, false);
  assert.equal("OutboundParams" in (filled.Gateway as object), false);
  assert.deepEqual((filled.Gateway as { Codecs: { delta: string[] } }).Codecs.delta, ["PCMU"]);
  const cleaned = trunkPostBody({
    IsOnline: false,
    Direction: "",
    ExternalNumber: "+1 (361) 226-7988",
    AuthPassword: { Value: "secret" },
    DidNumbers: { delta: ["13612267988"] },
    Messaging: { Enabled: false, MESSAGING_API_KEY: "abc", Provider: "voip", PROVIDER_URL: "https://example.invalid" },
    Gateway: { Host: "houston1.voip.ms", InboundParams: { delta: [{ ParamId: 1, Custom: "" }] } },
  });
  assert.equal("IsOnline" in cleaned, false);
  assert.equal("Direction" in cleaned, false);
  assert.equal(cleaned.ExternalNumber, "13612267988");
  assert.equal((cleaned.AuthPassword as { Value: string }).Value, "secret");
  assert.equal("MESSAGING_API_KEY" in (cleaned.Messaging as object), false);
  assert.equal("PROVIDER_URL" in (cleaned.Messaging as object), false);
  assert.equal((cleaned.Messaging as { Provider: string }).Provider, "voip");
  assert.equal((cleaned.Gateway as { InboundParams: { delta: { Custom: string }[] } }).InboundParams.delta[0].Custom, "");
  const service = trunkServiceBody({
    seed: {
      "@odata.context": "https://pbx.example/xapi/v1/$metadata#Trunks/$entity",
      "@odata.type": "#Pbx.Trunk",
      AuthPassword: { "@odata.type": "#Pbx.ConcealedPassword", Value: "" },
      DidNumbers: { "@odata.context": "https://pbx.example/xapi/v1/$metadata#Collection(String)" },
    },
    name: "SautiCall 3612267988",
    number: "3612267988",
    authId: "line-account",
    password: "secret",
    host: "houston1.voip.ms",
    template: "GenericSIPTrunk.pv.xml",
  });
  assert.equal(service["@odata.context"], "https://pbx.example/xapi/v1/$metadata#Trunks/$entity");
  assert.deepEqual((service.DidNumbers as { delta: string[]; "@odata.context": string }).delta, ["3612267988"]);
  assert.match(String((service.DidNumbers as { "@odata.context": string })["@odata.context"]), /Collection\(String\)/);
  assert.equal((service.AuthPassword as { Value: string })["Value"], "secret");
  const small = trunkSmallBody({
    name: "SautiCall 3612267988",
    number: "3612267988",
    authId: "line-account",
    password: "secret",
    host: "houston1.voip.ms",
    template: "GenericSIPTrunk.pv.xml",
  });
  assert.deepEqual(small.DidNumbers, ["3612267988"]);
  assert.equal(Array.isArray((small.Gateway as { Codecs: string[] }).Codecs), true);
  assert.equal(JSON.stringify(small).split("secret").length - 1, 1);
  assert.equal(trunkContentTypes[0][1].includes("charset"), false);
  assert.match(trunkContentTypes[0][1], /odata\.metadata=minimal/);
  assert.match(trunkContentTypes[0][1], /odata\.streaming=true/);
  assert.match(trunkContentTypes[0][1], /IEEE754Compatible=false/);
  assert.equal(trunkContentTypes[1][1].includes("charset"), false);
  assert.equal(outboundScopeVerdict({ DNRanges: { delta: [{ From: "510", To: "510" }] } }, "510", "510"), "scoped");
});

test("a created 3CX user id can come from the Location header", () => {
  assert.equal(idFromPbx({}, "https://pbx.example.com/xapi/v1/Users(38)"), 38);
  assert.equal(idFromPbx({}, "https://pbx.example.com/xapi/v1/OutboundRules(19)"), 19);
  assert.equal(idFromPbx({}, "https://pbx.example.com/xapi/v1/Trunks(7)"), 7);
  assert.equal(idFromPbx({ Id: 12 }, ""), 12);
  assert.equal(idFromPbx(null, ""), 0);
});
