import { redirect } from "next/navigation";

export default async function TrunksRedirect({ searchParams }: { searchParams: Promise<{ user?: string; error?: string }> }) {
  const params = await searchParams;
  const company = Number(params.user || 0);
  const error = params.error ? `&error=${encodeURIComponent(params.error)}` : "";
  redirect(`/admin/lines?tab=trunks${company ? `&company=${company}` : ""}${error}`);
}
