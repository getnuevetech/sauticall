import { DocumentEditor } from "@/components/admin/Editors";
import { requirePermission } from "@/lib/access";
import { screenFor } from "@/lib/admin-labels";
import { readDoc } from "@/lib/db";

export default async function FlagsPage() {
  await requirePermission("settings.flags");
  const screen = screenFor("flags");
  return (
    <>
      <span className="eyebrow">Settings</span>
      <h2>{screen.title}</h2>
      <p>{screen.intro} Buying numbers and sending transfers spend money at the phone company, so those stay off until you mean to use them.</p>
      <DocumentEditor docKey="flags" initial={readDoc("flags")} />
    </>
  );
}
