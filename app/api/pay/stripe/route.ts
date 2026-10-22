import { applyStripeEvent } from "@/lib/payments";

export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get("stripe-signature") || "";
  try {
    const ok = applyStripeEvent(raw, signature);
    return new Response(ok ? "ok" : "rejected", { status: ok ? 200 : 400 });
  } catch {
    return new Response("rejected", { status: 400 });
  }
}
