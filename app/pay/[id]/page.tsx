import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Frame } from "@/components/site/Frame";
import { currentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { customerMessage } from "@/lib/customer-message";
import { confirmReturn } from "@/lib/payments";

export default async function PayPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ session_id?: string; token?: string; orderId?: string; cancelled?: string; error?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const user = await currentUser();
  if (!user) redirect("/account/login");
  await confirmReturn(Number(id), query);
  const attempt = getDb()
    .prepare(
      `SELECT a.id, a.amount_cents, a.currency, a.description, a.status, a.user_id, a.checkout_url, a.product_minutes, g.public_label
       FROM payment_attempts a JOIN gateways g ON g.id = a.gateway_id WHERE a.id = ?`,
    )
    .get(id) as { id: number; amount_cents: number; currency: string; description: string; status: string; user_id: number; checkout_url: string; product_minutes: number; public_label: string } | undefined;
  if (!attempt || attempt.user_id !== user.id) notFound();
  return (
    <Frame pathname="/account/billing">
      <main>
        <section className="inner-hero">
          <div className="wrap">
            <span className="eyebrow">CHECKOUT</span>
            <h1>{attempt.public_label}</h1>
            <p>{attempt.description} · ${(attempt.amount_cents / 100).toFixed(2)} {attempt.currency}</p>
          </div>
        </section>
        <section className="section">
          <div className="wrap" style={{ maxWidth: 720 }}>
            <div className="contact-form">
              {query.error ? <p className="form-feedback">{customerMessage(query.error, "Payment could not be started. Please try again, or contact support.")}</p> : null}
              <p>Status: {attempt.status === "paid" ? "Paid" : attempt.status === "cancelled" ? "Cancelled" : attempt.status === "failed" ? "Could not start" : "Waiting for payment"}</p>
              {attempt.status === "pending" && attempt.checkout_url ? <a className="btn btn-primary" href={attempt.checkout_url}>Continue to payment</a> : null}
              {attempt.status === "paid" ? <p>Payment received. This charge will not be taken again.{attempt.product_minutes > 0 ? ` ${attempt.product_minutes} outbound minutes are on the account.` : ""}</p> : null}
              <p><Link className="text-link" href="/account/minutes">Call minutes</Link></p>
              <p><Link className="text-link" href="/account/billing">Back to billing</Link></p>
            </div>
          </div>
        </section>
      </main>
    </Frame>
  );
}
