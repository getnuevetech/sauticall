import { NextResponse } from "next/server";
import { userCan } from "@/lib/access";
import { readClip } from "@/lib/ai-audio-store";
import { currentUser } from "@/lib/auth";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  const { id } = await context.params;
  const clipId = Number(id);
  if (!user || !Number.isInteger(clipId) || clipId < 1) return new NextResponse(null, { status: 404 });
  const staff = user.role === "super_admin" || (user.role === "staff" && userCan(user, "settings.ai"));
  if (user.role !== "customer" && !staff) return new NextResponse(null, { status: 404 });
  const clip = readClip(clipId, user.id, staff);
  if (!clip) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(clip.bytes), {
    headers: {
      "content-type": clip.mime,
      "content-length": String(clip.bytes.length),
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
