import { redirect } from "next/navigation";

export default async function AccessEditorRedirect({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const extra = query.error ? `&error=${encodeURIComponent(query.error)}` : query.saved ? "&saved=1" : "";
  redirect(`/admin/access?level=${id}${extra}`);
}
