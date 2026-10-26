import { SupportHome } from "@/components/account/SupportHome";
import { guardAccount } from "@/lib/guard";
import { getDb, readDoc } from "@/lib/db";
import { accountHelp, chicagoDate, helpTopic, type HelpTopic } from "@/lib/account-display";
import { customerTickets, statusLabel } from "@/lib/tickets";

function plain(value: string) {
  return value.replace(/[#*_`>]/g, "").replace(/\s+/g, " ").trim();
}

export default async function AccountTicketsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await guardAccount();
  const params = await searchParams;
  const faqs = readDoc<{ q: string; a: string }[]>("faqs");
  const posts = getDb().prepare("SELECT slug, title, excerpt, body FROM faq_posts WHERE published = 1 ORDER BY updated_at DESC").all() as { slug: string; title: string; excerpt: string; body: string }[];
  const seen = new Set(accountHelp.map((item) => item.title.toLowerCase()));
  const articles: { id: string; category: HelpTopic; title: string; body: string; href?: string; link?: string }[] = accountHelp.map((item, index) => ({ ...item, id: `help-${index}` }));
  for (const post of posts) {
    if (seen.has(post.title.toLowerCase())) continue;
    seen.add(post.title.toLowerCase());
    articles.push({ id: post.slug, category: helpTopic(post.title), title: post.title, body: plain(post.excerpt || post.body).slice(0, 500) });
  }
  for (const faq of faqs) {
    if (seen.has(faq.q.toLowerCase())) continue;
    seen.add(faq.q.toLowerCase());
    articles.push({ id: faq.q, category: helpTopic(faq.q), title: faq.q, body: plain(faq.a).slice(0, 500) });
  }
  const tickets = customerTickets(user.id);
  return (
    <SupportHome
      initialTab={params.tab || "help"}
      articles={articles}
      tickets={tickets.map((ticket) => ({ id: ticket.id, subject: ticket.subject, status: statusLabel(ticket.status), when: chicagoDate(ticket.updated_at) }))}
    />
  );
}
