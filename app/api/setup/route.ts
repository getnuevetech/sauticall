import { NextResponse } from "next/server";
import { readDoc } from "@/lib/db";
import { recommendPlan } from "@/lib/setup-assistant";
import type { Plan } from "@/lib/types";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { prompt?: string } | null;
  const prompt = String(body?.prompt || "").trim();
  if (prompt.length < 3) return NextResponse.json({ message: "Describe the phone system you need." }, { status: 400 });
  const advice = recommendPlan(readDoc<Plan[]>("plans"), prompt);
  if (!advice) return NextResponse.json({ message: "No plan is available yet." }, { status: 404 });
  return NextResponse.json(advice);
}
