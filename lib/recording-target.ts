import crypto from "crypto";

export type RecordingProvider = "off" | "aws" | "google";

export type RecordingConfig = {
  provider: RecordingProvider;
  bucket: string;
  region: string;
  prefix: string;
  awsAccessKey: string;
  awsSecret: string;
  googleEmail: string;
  googleKey: string;
  retentionDays: number;
};

export function cleanPrefix(value: string) {
  const parts = value.trim().replace(/[^A-Za-z0-9/_-]/g, "").split("/").filter((part) => part && part !== "." && part !== "..");
  return parts.join("/") || "recordings";
}

export function recordingObjectKey(prefix: string, customerCode: string, id: number, extension: string) {
  const who = /^[IB]-\d{7}$/.test(customerCode) ? customerCode : "unassigned";
  const ext = extension === "mp3" ? "mp3" : extension === "txt" ? "txt" : "wav";
  return `${cleanPrefix(prefix)}/${who}/${id}.${ext}`;
}

export function validateRecording(input: RecordingConfig) {
  const provider: RecordingProvider = input.provider === "aws" || input.provider === "google" ? input.provider : "off";
  const bucket = input.bucket.trim().toLowerCase();
  const region = input.region.trim().toLowerCase();
  const prefix = cleanPrefix(input.prefix);
  const retentionDays = Math.round(input.retentionDays);
  if (!Number.isFinite(retentionDays) || retentionDays < 1 || retentionDays > 3650) {
    return { ok: false as const, message: "Retention must be between 1 and 3650 days." };
  }
  if (provider === "off") {
    return { ok: true as const, config: { ...blankSecrets(input), provider, bucket: "", region: "", prefix, retentionDays } };
  }
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) || bucket.includes("..")) {
    return { ok: false as const, message: "Enter the bucket name as the storage service shows it." };
  }
  if (provider === "aws" && !/^[a-z]{2}-[a-z]+-\d$/.test(region)) {
    return { ok: false as const, message: "Enter the Amazon region, such as us-east-1." };
  }
  if (provider === "aws" && !input.awsAccessKey.trim()) {
    return { ok: false as const, message: "Enter the Amazon access key id." };
  }
  if (provider === "aws" && !input.awsSecret.trim()) {
    return { ok: false as const, message: "Enter the Amazon secret access key." };
  }
  if (provider === "google" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.googleEmail.trim())) {
    return { ok: false as const, message: "Enter the Google service account email." };
  }
  if (provider === "google" && !input.googleKey.includes("PRIVATE KEY")) {
    return { ok: false as const, message: "Paste the Google service account private key." };
  }
  return {
    ok: true as const,
    config: {
      provider,
      bucket,
      region: provider === "aws" ? region : "",
      prefix,
      awsAccessKey: input.awsAccessKey.trim(),
      awsSecret: input.awsSecret,
      googleEmail: input.googleEmail.trim(),
      googleKey: input.googleKey.includes("\\n") ? input.googleKey.replace(/\\n/g, "\n") : input.googleKey,
      retentionDays,
    },
  };
}

function blankSecrets(input: RecordingConfig): RecordingConfig {
  return { ...input, awsAccessKey: "", awsSecret: "", googleEmail: "", googleKey: "" };
}

export function recordingDestination(config: Pick<RecordingConfig, "provider" | "bucket" | "region" | "prefix">, objectKey: string) {
  if (config.provider === "aws") return `s3://${config.bucket}/${objectKey}`;
  if (config.provider === "google") return `gs://${config.bucket}/${objectKey}`;
  return "";
}

function hmac(key: Buffer | string, value: string) {
  return crypto.createHmac("sha256", key).update(value).digest();
}

export function encodeKey(objectKey: string) {
  return objectKey.split("/").map((part) => encodeURIComponent(part)).join("/");
}

export function awsPutRequest(input: { config: RecordingConfig; objectKey: string; body: Buffer; contentType: string; now: Date }) {
  const host = `${input.config.bucket}.s3.${input.config.region}.amazonaws.com`;
  const path = `/${encodeKey(input.objectKey)}`;
  const amzDate = input.now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amzDate.slice(0, 8);
  const payloadHash = crypto.createHash("sha256").update(input.body).digest("hex");
  const canonicalHeaders = `content-type:${input.contentType}\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
  const canonical = ["PUT", path, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${date}/${input.config.region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, crypto.createHash("sha256").update(canonical).digest("hex")].join("\n");
  const signing = hmac(hmac(hmac(hmac(`AWS4${input.config.awsSecret}`, date), input.config.region), "s3"), "aws4_request");
  const signature = crypto.createHmac("sha256", signing).update(stringToSign).digest("hex");
  return {
    url: `https://${host}${path}`,
    headers: {
      "content-type": input.contentType,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      authorization: `AWS4-HMAC-SHA256 Credential=${input.config.awsAccessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}

export function googleAssertion(email: string, privateKey: string, now: number) {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const claim = Buffer.from(JSON.stringify({
    iss: email,
    scope: "https://www.googleapis.com/auth/devstorage.read_write",
    aud: "https://oauth2.googleapis.com/token",
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + 3600,
  })).toString("base64url");
  const data = `${header}.${claim}`;
  const signature = crypto.createSign("RSA-SHA256").update(data).sign(privateKey).toString("base64url");
  return `${data}.${signature}`;
}
