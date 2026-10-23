import { notFound, redirect } from "next/navigation";
import { DocumentEditor } from "@/components/admin/Editors";
import { requirePermission } from "@/lib/access";
import { permissionForDocument } from "@/lib/access-catalog";
import { screenFor } from "@/lib/admin-labels";
import { getDb } from "@/lib/db";

export default async function ContentPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const permission = permissionForDocument(key);
  if (!permission) redirect("/admin/denied");
  await requirePermission(permission);
  const row = getDb().prepare("SELECT json FROM documents WHERE key = ?").get(key) as { json: string } | undefined;
  if (!row) notFound();
  const screen = screenFor(key);
  return (
    <>
      <span className="eyebrow">Edit</span>
      <h2>{screen.title}</h2>
      <p>{screen.intro}</p>
      <DocumentEditor docKey={key} initial={JSON.parse(row.json)} />
    </>
  );
}
