import Link from "next/link";
import { requirePermission } from "@/lib/access";
import { formatWhen } from "@/lib/format-when";
import { getDb } from "@/lib/db";

type Post = { id: number; slug: string; title: string; published: number; updated_at: string };

export default async function FaqAdminPage() {
  await requirePermission("blog.manage");
  const posts = getDb().prepare("SELECT id, slug, title, published, updated_at FROM faq_posts ORDER BY updated_at DESC").all() as Post[];
  return (
    <>
      <span className="eyebrow">FAQ blog</span>
      <h2>FAQ articles</h2>
      <p>Published articles appear on the public FAQ page. Pricing-page questions stay under Questions and are separate from these articles.</p>
      <p><Link className="btn btn-primary" href="/admin/faq/new">New article</Link></p>
      {posts.length === 0 ? <p>No articles yet.</p> : null}
      {posts.map((post) => (
        <article key={post.id} className="feature-card" style={{ marginBottom: 12 }}>
          <h3><Link href={`/admin/faq/${post.id}`}>{post.title}</Link></h3>
          <p>{post.published ? "Published" : "Draft"} · /faq/{post.slug} · {formatWhen(post.updated_at)}</p>
        </article>
      ))}
    </>
  );
}
