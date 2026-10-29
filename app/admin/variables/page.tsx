import { VariableDesk } from "@/components/admin/VariableDesk";
import { requirePermission } from "@/lib/access";
import { listLineVariables } from "@/lib/line-variable-store";

export default async function VariablesPage({ searchParams }: { searchParams: Promise<{ saved?: string; key?: string; q?: string }> }) {
  await requirePermission("settings.connections");
  const params = await searchParams;
  const variables = listLineVariables();
  const selected = variables.some((item) => item.key === params.key) ? params.key || "" : variables[0]?.key || "";
  return (
    <>
      {params.saved ? <p className="form-feedback">The variable was saved. Existing line accounts were not changed.</p> : null}
      <VariableDesk variables={variables} selectedKey={selected} />
    </>
  );
}
