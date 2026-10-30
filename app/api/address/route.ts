import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { readGoogleAddress, suggestAddresses } from "@/lib/google-places";

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ suggestions: [], message: "Sign in to look up an address." }, { status: 401 });
  const url = new URL(request.url);
  const place = String(url.searchParams.get("place") || "");
  try {
    if (place) {
      const result = await readGoogleAddress(place);
      return NextResponse.json(result.ok ? { address: result.address, message: "" } : { message: result.message });
    }
    const result = await suggestAddresses(String(url.searchParams.get("q") || ""));
    return NextResponse.json({ suggestions: result.suggestions, message: result.message });
  } catch {
    return NextResponse.json({ suggestions: [], message: "Google address lookup is not available right now." }, { status: 502 });
  }
}
