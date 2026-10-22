import { NextResponse } from "next/server";
import { flagOn, getDb, readDoc } from "@/lib/db";

export async function POST(request: Request) {
  const page = readDoc<Record<string, string>>("page.custom");
  if (!flagOn("sales.custom_request")) {
    return NextResponse.json({ message: page.closed || "Custom plan requests are turned off." }, { status: 403 });
  }
  const body = (await request.json()) as { name?: string; company?: string; email?: string; phone?: string; needs?: string };
  const name = String(body.name || "").trim();
  const company = String(body.company || "").trim();
  const email = String(body.email || "").trim();
  const phone = String(body.phone || "").trim();
  const needs = String(body.needs || "").trim();
  if (!name || !company || !email.includes("@") || !phone || !needs) {
    return NextResponse.json({ message: "Name, business, email, phone, and a description of the system are required." }, { status: 400 });
  }
  getDb()
    .prepare("INSERT INTO messages (name, email, service, body, phone, company, kind, created_at) VALUES (?, ?, ?, ?, ?, ?, 'custom_plan', ?)")
    .run(name, email, "Custom plan", needs, phone, company, new Date().toISOString());
  return NextResponse.json({ message: (page.thanks || "Thanks, {name}.").replace("{name}", name) });
}
