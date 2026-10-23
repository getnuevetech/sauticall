import Link from "next/link";
import { Frame } from "@/components/site/Frame";
import { formatWhen } from "@/lib/format-when";
import { getDb } from "@/lib/db";

type Post = { slug: string; title: string; excerpt: string; updated_at: string };

export default function FaqPage() {
  const posts = getDb().prepare("SELECT slug, title, excerpt, updated_at FROM faq_posts WHERE published = 1 ORDER BY updated_at DESC").all() as Post[];
  return (
    <Frame pathname="/faq">
      <main>
        <section className="inner-hero">
          <div className="wrap">
            <span className="eyebrow">FAQ</span>
            <h1>Answers for your phone system.</h1>
            <p>Articles written by the SautiCall team. Sign in if you need help with your own account.</p>
          </div>
        </section>
        <section className="section">
          <div className="wrap faq-article">
            {posts.length === 0 ? <p>Articles will appear here.</p> : null}
            {posts.map((post) => (
              <article key={post.slug} className="feature-card" style={{ marginBottom: 16 }}>
                <h3><Link href={`/faq/${post.slug}`}>{post.title}</Link></h3>
                {post.excerpt ? <p>{post.excerpt}</p> : null}
                <p>{formatWhen(post.updated_at)}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
    </Frame>
  );
}
