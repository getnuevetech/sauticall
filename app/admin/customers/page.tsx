import Link from "next/link";
import { requirePermission } from "@/lib/access";
import { formatWhen } from "@/lib/format-when";
import { getDb } from "@/lib/db";

type Customer = {
  id: number;
  name: string;
  email: string;
  created_at: string;
  disabled: number;
  plan_name: string | null;
  lines: number;
  open_tickets: number;
};

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requirePermission("users.customers");
  const query = (await searchParams).q?.trim() || "";
  const like = `%${query.replaceAll("%", "")}%`;
  const people = getDb()
    .prepare(
      `SELECT u.id, u.name, u.email, u.created_at, u.disabled,
        (SELECT plan_name FROM payment_attempts p WHERE p.user_id = u.id AND p.status = 'paid' AND p.plan_name != '' ORDER BY p.id DESC LIMIT 1) AS plan_name,
        (SELECT COUNT(*) FROM phone_lines l WHERE l.user_id = u.id) AS lines,
        (SELECT COUNT(*) FROM tickets t WHERE t.user_id = u.id AND t.status NOT IN ('resolved', 'closed')) AS open_tickets
       FROM users u
       WHERE u.role = 'customer' AND (? = '' OR u.name LIKE ? OR u.email LIKE ?)
       ORDER BY u.name`,
    )
    .all(query, like, like) as Customer[];
  return (
    <>
      <span className="eyebrow">Customers</span>
      <h2>Customer accounts</h2>
      <p>People who signed up to buy phone service. Admin users are not listed here.</p>
      <form className="desk-filters" method="get">
        <label>Search <input name="q" defaultValue={query} placeholder="Name or email" /></label>
        <button className="btn btn-secondary" type="submit">Search</button>
      </form>
      {people.length === 0 ? <p>No customer accounts match.</p> : null}
      {people.length ? (
        <div className="desk-table-wrap">
          <table className="desk-table">
            <thead>
              <tr><th>Customer</th><th>Plan</th><th>Numbers</th><th>Open tickets</th><th>Joined</th><th>Sign-in</th><th></th></tr>
            </thead>
            <tbody>
              {people.map((person) => (
                <tr key={person.id}>
                  <td><b>{person.name}</b><span>{person.email}</span></td>
                  <td>{person.plan_name || "No paid plan"}</td>
                  <td>{person.lines}</td>
                  <td>{person.open_tickets}</td>
                  <td>{formatWhen(person.created_at)}</td>
                  <td>{person.disabled ? "Turned off" : "On"}</td>
                  <td><Link href={`/admin/customers/${person.id}`}>Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
