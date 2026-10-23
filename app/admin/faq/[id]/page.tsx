import { notFound } from "next/navigation";
import { deleteFaq, saveFaq } from "../../desk-actions";
import { requirePermission } from "@/lib/access";
import { getDb } from "@/lib/db";

type Post = { id: number; slug: string; title: string; excerpt: string; body: string; published: number };

export default async function FaqEditorPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  await requirePermission("blog.manage");
  const { id } = await params;
  const query = await searchParams;
  const creating = id === "new";
  const post = creating ? null : getDb().prepare("SELECT id, slug, title, excerpt, body, published FROM faq_posts WHERE id = ?").get(Number(id)) as Post | undefined;
  if (!creating && !post) notFound();
  return (
    <>
      <span className="eyebrow">FAQ blog</span>
      <h2>{creating ? "New article" : "Edit article"}</h2>
      <p>Use a blank line between paragraphs. Start a line with # for a heading, ## for a smaller heading, or - for a bullet. **Bold** and [links](https://example.com) work.</p>
      {query.error ? <p className="form-feedback">{query.error}</p> : null}
      <form className="contact-form" action={saveFaq}>
        {post ? <input type="hidden" name="id" value={post.id} /> : null}
        <label>Title <input name="title" defaultValue={post?.title || ""} required /></label>
        <label>Address <input name="slug" defaultValue={post?.slug || ""} placeholder="how-support-works" /></label>
        <label>Short summary <input name="excerpt" defaultValue={post?.excerpt || ""} /></label>
        <label>Article <textarea name="body" rows={14} required defaultValue={post?.body || ""} /></label>
        <label className="check-option"><input type="checkbox" name="published" defaultChecked={post ? post.published === 1 : true} /> Published on the FAQ page</label>
        <button className="btn btn-primary" type="submit">Save article</button>
      </form>
      {post ? (
        <form action={deleteFaq} style={{ marginTop: 12 }}>
          <input type="hidden" name="id" value={post.id} />
          <button className="btn btn-secondary" type="submit">Delete article</button>
        </form>
      ) : null}
    </>
  );
}
