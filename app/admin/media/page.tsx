import { MediaForm } from "@/components/admin/MediaForm";
import { requirePermission } from "@/lib/access";

export default async function MediaPage() {
  await requirePermission("inbox.media");
  return (
    <>
      <span className="eyebrow">Images</span>
      <h2>Upload a picture</h2>
      <p>After it saves, copy the address into Logo image address under Colors and font.</p>
      <MediaForm />
    </>
  );
}
