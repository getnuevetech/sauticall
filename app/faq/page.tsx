import type { Metadata } from "next";
import { Frame } from "@/components/site/Frame";
import { HelpCenter } from "@/components/site/HelpCenter";
import { getDb } from "@/lib/db";
import { loadSite, pageMetadata } from "@/lib/site";

export function generateMetadata(): Metadata {
  return pageMetadata(loadSite().help);
}

type Post = { slug: string; title: string; excerpt: string };

export default function FaqPage() {
  const posts = getDb().prepare("SELECT slug, title, excerpt FROM faq_posts WHERE published = 1 ORDER BY updated_at DESC").all() as Post[];
  const site = loadSite();
  return (
    <Frame pathname="/faq">
      <HelpCenter faqs={site.faqs} posts={posts} page={site.help} />
    </Frame>
  );
}
