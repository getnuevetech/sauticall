import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { invoiceText } from "@/lib/account-display";
import { getDb } from "@/lib/db";

type Paid = { id: number; amount_cents: number; currency: string; description: string; plan_name: string; paid_at: string; created_at: string };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user || user.role !== "customer" || user.mfa_pending) {
    return new NextResponse("Sign in to download this invoice.", { status: 401 });
  }
  const { id } = await params;
  const paymentId = Number(id);
  if (!Number.isInteger(paymentId) || paymentId <= 0) return new NextResponse("Not found.", { status: 404 });
  const row = getDb().prepare(
    "SELECT id, amount_cents, currency, description, plan_name, paid_at, created_at FROM payment_attempts WHERE id = ? AND user_id = ? AND status = 'paid'",
  ).get(paymentId, user.id) as Paid | undefined;
  if (!row) return new NextResponse("Not found.", { status: 404 });
  const number = `INV-${String(row.id).padStart(3, "0")}`;
  const body = invoiceText({
    id: row.id,
    amountCents: row.amount_cents,
    currency: row.currency,
    description: row.description,
    planName: row.plan_name,
    when: row.paid_at || row.created_at,
  });
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${number}.txt"`,
    },
  });
}
