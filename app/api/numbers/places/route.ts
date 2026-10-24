import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { listRateCenters } from "@/lib/carriers";
import { regionAllowed } from "@/lib/places";

function placesMessage(status: string) {
  if (status === "invalid_state" || status === "invalid_province" || status === "missing_state") return "Choose a state or province from the list.";
  if (status === "success") return "";
  console.error(`[sauticall] cities ${status}`);
  return "The city list is not available right now. Try again shortly.";
}

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ places: [], message: "Sign in to load cities." }, { status: 401 });
  const url = new URL(request.url);
  const country = url.searchParams.get("country") === "CA" ? "CA" : "US";
  const region = String(url.searchParams.get("region") || "").trim().toUpperCase();
  if (!regionAllowed(country, region)) return NextResponse.json({ places: [], message: "Choose a state or province from the list." }, { status: 400 });
  try {
    const result = await listRateCenters(country, region);
    return NextResponse.json({ places: result.places, message: result.ok ? "" : placesMessage(result.message) });
  } catch (error) {
    console.error(`[sauticall] cities ${error instanceof Error ? error.message : "unreachable"}`);
    return NextResponse.json({ places: [], message: "The city list is not available right now. Try again shortly." }, { status: 502 });
  }
}
