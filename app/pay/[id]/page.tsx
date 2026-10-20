import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Frame } from "@/components/site/Frame";
import { currentUser } from "@/lib/auth";
import { audit, getDb } from "@/lib/db";

export default async function PayPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const user = await currentUser();
  if (!user) redirect("/account/login");
  const attempt = getDb()
    .prepare(
      `SELECT a.id, a.amount_cents, a.currency, a.description, a.status, a.user_id, g.public_label, g.mode, g.enabled
       FROM payment_attempts a JOIN gateways g ON g.id = a.gateway_id WHERE a.id = ?`,
    )
    .get(id) as { id: number; amount_cents: number; currency: string; description: string; status: string; user_id: number; public_label: string; mode: string; enabled: number } | undefined;
  if (!attempt || attempt.user_id !== user.id) notFound();
  if (query.done === "1" && attempt.mode === "test" && attempt.enabled) {
    getDb().prepare("UPDATE payment_attempts SET status = 'paid' WHERE id = ? AND status = 'pending'").run(attempt.id);
    audit(user.email, "billing.paid", String(attempt.id));
    attempt.status = "paid";
  }
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
              <p>Status: {attempt.status}</p>
              {attempt.mode === "test" && attempt.status !== "paid" ? (
                <>
                  <p>This gateway is in test mode. Confirming does not charge a card.</p>
                  <Link className="btn btn-primary" href={`/pay/${attempt.id}?done=1`}>Confirm test payment</Link>
                </>
              ) : null}
              {attempt.mode === "live" && attempt.status !== "paid" ? <p>Live charges are not connected for this gateway yet. An administrator can keep it in test mode until credentials are verified.</p> : null}
              {attempt.status === "paid" ? <p>Payment recorded. No second charge will be created for this attempt.</p> : null}
              <p><Link className="text-link" href="/account/billing">Back to billing</Link></p>
            </div>
          </div>
        </section>
      </main>
    </Frame>
  );
}
