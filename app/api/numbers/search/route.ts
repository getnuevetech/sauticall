import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { searchDids, searchPatternDids } from "@/lib/carriers";
import { flagOn } from "@/lib/db";
import { parseDigitSearch } from "@/lib/did-search";
import { regionAllowed } from "@/lib/places";

function inventoryMessage(status: string) {
  if (status === "invalid_ratecenter" || status === "missing_ratecenter") return "Choose another city.";
  if (status === "missing_state" || status === "invalid_state" || status === "invalid_province") return "Choose a state or province from the list.";
  if (status === "success" || status.startsWith("no_")) return "";
  console.error(`[sauticall] inventory ${status}`);
  return "The number list is not available right now. Try again shortly.";
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
  const mode = String(url.searchParams.get("mode") || "city");
  if (!/^[A-Za-z]{2}$/.test(region) || !regionAllowed(country, region)) return NextResponse.json({ available: true, dids: [], message: "Choose a state or province from the list." }, { status: 400 });
  const pattern = mode === "city" ? null : parseDigitSearch(mode, String(url.searchParams.get("query") || ""));
  if (pattern && !pattern.ok) return NextResponse.json({ available: true, dids: [], message: pattern.message }, { status: 400 });
  if (!pattern && !ratecenter) return NextResponse.json({ available: true, dids: [], message: "Choose a city." }, { status: 400 });
  try {
    const result = pattern && pattern.ok ? await searchPatternDids(country, region, pattern.search) : await searchDids(country, region, ratecenter);
    return NextResponse.json({ available: true, dids: result.dids, message: result.ok ? "" : inventoryMessage(result.message) });
  } catch (error) {
    console.error(`[sauticall] inventory ${error instanceof Error ? error.message : "unreachable"}`);
    return NextResponse.json({ available: true, dids: [], message: "The number list is not available right now. Try again shortly." }, { status: 502 });
  }
}
