import { PlatformControls } from "@/components/admin/PlatformControls";
import { requirePermission } from "@/lib/access";
import type { FlagRecord } from "@/lib/admin-controls";
import { readDoc } from "@/lib/db";

export default async function FlagsPage() {
  await requirePermission("settings.flags");
  const flags = readDoc<FlagRecord[]>("flags");
  return (
    <>
      <h1>Platform controls</h1>
      <p>Turn customer operations on or off. A switch shows the choice you are making. It applies after you save.</p>
      <PlatformControls initial={Array.isArray(flags) ? flags : []} />
    </>
  );
}
