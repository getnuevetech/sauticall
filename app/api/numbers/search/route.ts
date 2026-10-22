import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { searchDids } from "@/lib/carriers";
import { flagOn } from "@/lib/db";

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ message: "Sign in to search numbers." }, { status: 401 });
  if (!flagOn("numbers.search") || !flagOn("numbers.live_search")) {
    return NextResponse.json({ available: false, dids: [], message: "Live number search is turned off." });
  }
  const url = new URL(request.url);
  const country = url.searchParams.get("country") === "CA" ? "CA" : "US";
  const region = String(url.searchParams.get("region") || "").trim();
  const ratecenter = String(url.searchParams.get("ratecenter") || "").trim();
  if (!/^[A-Za-z]{2}$/.test(region)) return NextResponse.json({ available: true, dids: [], message: "Use a two-letter state or province code." }, { status: 400 });
  try {
    const result = await searchDids(country, region, ratecenter);
    return NextResponse.json({ available: true, dids: result.dids, message: result.ok ? "" : result.message });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The carrier could not be reached.";
    return NextResponse.json({ available: true, dids: [], message }, { status: 502 });
  }
}
