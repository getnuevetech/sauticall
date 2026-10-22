import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Frame } from "@/components/site/Frame";
import { renderFaq } from "@/lib/faq-markdown";
import { formatWhen } from "@/lib/format-when";
import { getDb } from "@/lib/db";

type Post = { slug: string; title: string; excerpt: string; body: string; author_name: string; updated_at: string };

function load(slug: string) {
  return getDb().prepare("SELECT slug, title, excerpt, body, author_name, updated_at FROM faq_posts WHERE slug = ? AND published = 1").get(slug) as Post | undefined;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const post = load((await params).slug);
  return { title: post ? `${post.title} · SautiCall` : "FAQ · SautiCall", description: post?.excerpt || "" };
}

export default async function FaqArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const post = load((await params).slug);
  if (!post) notFound();
  return (
    <Frame pathname="/faq">
      <main>
        <section className="inner-hero">
          <div className="wrap">
            <span className="eyebrow">FAQ</span>
            <h1>{post.title}</h1>
            <p>{post.author_name} · {formatWhen(post.updated_at)}</p>
          </div>
        </section>
        <section className="section">
          <div className="wrap faq-article">
            <div dangerouslySetInnerHTML={{ __html: renderFaq(post.body) }} />
            <p style={{ marginTop: 28 }}><Link className="text-link" href="/faq">All articles</Link></p>
          </div>
        </section>
      </main>
    </Frame>
  );
}
