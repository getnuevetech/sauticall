import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { matchesCustomer, contactLines } from "../lib/customer-view.ts";
import { ago, failureFacts, groupFailures, providerFor, withinDays } from "../lib/failure-desk.ts";
import { awsPutRequest, googleAssertion, recordingObjectKey, validateRecording, type RecordingConfig } from "../lib/recording-target.ts";

const row = { code: "B0000012", company: "Acme Studio", contact: "Alex Morgan", email: "alex@acme.example", phone: "2025550101", plan: "Small Business" };

test("customer search matches the public ID, name, and mobile", () => {
  assert.equal(matchesCustomer(row, { q: "B0000012", plan: "all", signin: "all" }), true);
  assert.equal(matchesCustomer(row, { q: "alex morgan", plan: "all", signin: "all" }), true);
  assert.equal(matchesCustomer(row, { q: "(202) 555-0101", plan: "all", signin: "all" }), true);
  assert.equal(matchesCustomer(row, { q: "missing", plan: "all", signin: "all" }), false);
  assert.equal(matchesCustomer(row, { q: "", plan: "none", signin: "all" }), false);
  assert.equal(matchesCustomer({ ...row, plan: "No paid plan" }, { q: "", plan: "none", signin: "disabled" }), true);
});

test("a contact address keeps street, suite, city, and country", () => {
  const lines = contactLines({
    full_name: "Alex Morgan",
    street_number: "120",
    street_name: "Example Avenue",
    address_type: "STE",
    address_number: "200",
    city: "Austin",
    state: "TX",
    country: "US",
    zip: "78701",
    language: "EN",
  });
  assert.deepEqual(lines, ["120 Example Avenue", "Suite 200", "Austin, TX 78701", "United States"]);
  assert.equal(contactLines(null).length, 0);
});

test("failed requests group attempts and read the provider error", () => {
  const detail = '{"status": 400, "error": "delta_required", "message": "Required field missing"}';
  const facts = failureFacts(detail);
  assert.equal(facts.status, "400");
  assert.equal(facts.code, "delta_required");
  assert.equal(providerFor("trunk"), "3CX");
  assert.equal(providerFor("client"), "VoIP.ms");
  const groups = groupFailures([
    { id: 1, area: "trunk", userId: 4, subject: "DEMO-TRK-1042", detail, createdAt: "2026-10-30T12:00:00.000Z" },
    { id: 2, area: "trunk", userId: 4, subject: "DEMO-TRK-1042", detail, createdAt: "2026-10-30T13:00:00.000Z" },
    { id: 3, area: "email", userId: 4, subject: "mail", detail: "timeout", createdAt: "2026-10-30T14:00:00.000Z" },
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].attempts.length, 1);
  assert.equal(groups[1].attempts.length, 2);
  assert.equal(groups[1].latest.id, 2);
  assert.equal(withinDays("2026-10-30T12:00:00.000Z", 30, Date.parse("2026-10-30T18:00:00.000Z")), true);
  assert.equal(withinDays("2026-01-01T00:00:00.000Z", 7, Date.parse("2026-10-30T18:00:00.000Z")), false);
  assert.equal(ago("2026-10-30T17:00:00.000Z", Date.parse("2026-10-30T18:12:00.000Z")), "1 hr ago");
});

test("recording keys stay inside the bucket prefix and the AWS signature hides the secret", () => {
  assert.equal(recordingObjectKey("recordings", "B0000012", 9, "wav"), "recordings/B0000012/9.wav");
  assert.equal(recordingObjectKey("../etc", "customer-1", 9, "wav"), "etc/unassigned/9.wav");
  const config: RecordingConfig = {
    provider: "aws",
    bucket: "sauticall-recordings",
    region: "us-east-1",
    prefix: "recordings",
    awsAccessKey: "AKIAEXAMPLE",
    awsSecret: "super-secret-value",
    googleEmail: "",
    googleKey: "",
    retentionDays: 365,
  };
  const request = awsPutRequest({ config, objectKey: "recordings/B0000012/9.wav", body: Buffer.from("hello"), contentType: "audio/wav", now: new Date("2026-10-30T18:00:00.000Z") });
  assert.equal(request.url, "https://sauticall-recordings.s3.us-east-1.amazonaws.com/recordings/B0000012/9.wav");
  assert.equal(request.headers.authorization.includes("super-secret-value"), false);
  assert.equal(request.url.includes("super-secret-value"), false);
  assert.equal(validateRecording({ ...config, region: "texas" }).ok, false);
  assert.equal(validateRecording({ ...config, provider: "off" }).ok, true);
});

test("a Google assertion is a signed token and does not echo the private key", () => {
  const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const token = googleAssertion("recordings@project.iam.gserviceaccount.com", pem, Date.parse("2026-10-30T18:00:00.000Z"));
  assert.equal(token.split(".").length, 3);
  assert.equal(token.includes("PRIVATE KEY"), false);
  const saved = validateRecording({
    provider: "google",
    bucket: "sauticall-recordings",
    region: "",
    prefix: "recordings",
    awsAccessKey: "",
    awsSecret: "",
    googleEmail: "recordings@project.iam.gserviceaccount.com",
    googleKey: pem,
    retentionDays: 30,
  });
  assert.equal(saved.ok, true);
});
