import { DocumentEditor } from "@/components/admin/Editors";
import { requirePermission } from "@/lib/access";
import { screenFor } from "@/lib/admin-labels";
import { readDoc } from "@/lib/db";

export default async function ThemePage() {
  await requirePermission("settings.theme");
  const screen = screenFor("theme");
  return (
    <>
      <span className="eyebrow">Look</span>
      <h2>{screen.title}</h2>
      <p>{screen.intro} To use your own logo, upload it under Images, then paste the address into Logo image address.</p>
      <DocumentEditor docKey="theme" initial={readDoc("theme")} />
    </>
  );
}
