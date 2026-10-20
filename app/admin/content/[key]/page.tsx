import { notFound } from "next/navigation";
import { DocumentEditor } from "@/components/admin/Editors";
import { getDb } from "@/lib/db";

export default async function ContentPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const row = getDb().prepare("SELECT json FROM documents WHERE key = ?").get(key) as { json: string } | undefined;
  if (!row) notFound();
  return (
    <>
      <span className="eyebrow">CONTENT</span>
      <h2>{key}</h2>
      <p>Every field on this screen is what the public site and account pages read.</p>
      <DocumentEditor docKey={key} initial={JSON.parse(row.json)} />
    </>
  );
}
