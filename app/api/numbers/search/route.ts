import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { searchDids } from "@/lib/carriers";
import { flagOn } from "@/lib/db";

function inventoryMessage(status: string) {
  if (status === "not_configured") return "VoIP.ms is not connected, so inventory cannot be searched.";
  if (status === "invalid_credentials") return "VoIP.ms rejected the API login.";
  if (status === "invalid_ratecenter" || status === "missing_ratecenter") return "That city was not found. Use the rate center name, such as HOUSTON.";
  if (status === "missing_state" || status === "invalid_state" || status === "invalid_province") return "Use a two-letter state or province code.";
  return status === "success" ? "" : `The carrier returned ${status}.`;
}

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ message: "Sign in to search numbers." }, { status: 401 });
  if (!flagOn("numbers.search") || !flagOn("numbers.live_search")) {
    return NextResponse.json({ available: false, dids: [], message: "Number inventory search is turned off." });
  }
  const url = new URL(request.url);
  const country = url.searchParams.get("country") === "CA" ? "CA" : "US";
  const region = String(url.searchParams.get("region") || "").trim();
  const ratecenter = String(url.searchParams.get("ratecenter") || "").trim();
  if (!/^[A-Za-z]{2}$/.test(region)) return NextResponse.json({ available: true, dids: [], message: "Use a two-letter state or province code." }, { status: 400 });
  try {
    const result = await searchDids(country, region, ratecenter);
    return NextResponse.json({ available: true, dids: result.dids, message: result.ok ? "" : inventoryMessage(result.message) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The carrier could not be reached.";
    return NextResponse.json({ available: true, dids: [], message }, { status: 502 });
  }
}
