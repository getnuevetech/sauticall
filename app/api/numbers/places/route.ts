import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { listRateCenters } from "@/lib/carriers";
import { regionAllowed } from "@/lib/places";

function placesMessage(status: string) {
  if (status === "not_configured") return "VoIP.ms is not connected, so the city list cannot be loaded.";
  if (status === "invalid_credentials") return "VoIP.ms rejected the API login.";
  if (status === "invalid_state" || status === "invalid_province" || status === "missing_state") return "Choose a state or province from the list.";
  return status === "success" ? "" : `The carrier returned ${status}.`;
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
    const message = error instanceof Error ? error.message : "The carrier could not be reached.";
    return NextResponse.json({ places: [], message }, { status: 502 });
  }
}
