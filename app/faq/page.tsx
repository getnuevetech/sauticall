import { Frame } from "@/components/site/Frame";
import { HelpCenter } from "@/components/site/HelpCenter";
import { getDb } from "@/lib/db";
import { loadSite } from "@/lib/site";

type Post = { slug: string; title: string; excerpt: string };

export default function FaqPage() {
  const posts = getDb().prepare("SELECT slug, title, excerpt FROM faq_posts WHERE published = 1 ORDER BY updated_at DESC").all() as Post[];
  const site = loadSite();
  return (
    <Frame pathname="/faq">
      <HelpCenter faqs={site.faqs} posts={posts} />
    </Frame>
  );
}
