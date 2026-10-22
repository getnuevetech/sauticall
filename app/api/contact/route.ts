import { NextResponse } from "next/server";
import { flagOn, getDb } from "@/lib/db";
import { readDoc } from "@/lib/db";

export async function POST(request: Request) {
  if (!flagOn("contact.form")) {
    const page = readDoc<Record<string, string>>("page.contact");
    return NextResponse.json({ message: page.closed || "The contact form is turned off." }, { status: 403 });
  }
  const body = (await request.json()) as { name?: string; email?: string; service?: string; message?: string };
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim();
  const service = String(body.service || "").trim();
  const message = String(body.message || "").trim();
  if (!name || !email || !message) return NextResponse.json({ message: "Name, email, and a note are required." }, { status: 400 });
  getDb().prepare("INSERT INTO messages (name, email, service, body, phone, company, kind, created_at) VALUES (?, ?, ?, ?, '', '', 'contact', ?)").run(name, email, service, message, new Date().toISOString());
  const page = readDoc<Record<string, string>>("page.contact");
  return NextResponse.json({ message: (page.thanks || "Thanks, {name}.").replace("{name}", name) });
}
