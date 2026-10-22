import { NextResponse } from "next/server";
import { parseMailPayload } from "@/lib/mail-parse";
import { inboundAuthorized, receiveMail } from "@/lib/tickets";

export const dynamic = "force-dynamic";

function tokenFrom(request: Request, body: unknown) {
  const header = request.headers.get("authorization") || "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const alternate = request.headers.get("x-sauticall-token") || "";
  const field = body && typeof body === "object" && "token" in body ? String((body as { token?: unknown }).token || "") : "";
  return bearer || alternate || field;
}

async function payload(request: Request) {
  const type = request.headers.get("content-type") || "";
  if (type.includes("application/json")) return request.json().catch(() => null);
  if (type.includes("form")) {
    const form = await request.formData();
    return Object.fromEntries([...form.entries()].map(([key, value]) => [key, typeof value === "string" ? value : ""]));
  }
  const text = await request.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { text };
  }
}

export async function POST(request: Request) {
  const body = await payload(request);
  if (!inboundAuthorized(tokenFrom(request, body))) return NextResponse.json({ error: "That inbound secret is not valid." }, { status: 401 });
  const mail = parseMailPayload(body);
  if (!mail) return NextResponse.json({ error: "A from address is required." }, { status: 400 });
  const result = await receiveMail(mail);
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 422 });
  return NextResponse.json({ ok: true, id: result.id, duplicate: result.duplicate });
}
