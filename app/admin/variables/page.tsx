import { saveLineVariables } from "../actions";
import { requirePermission } from "@/lib/access";
import { listLineVariables } from "@/lib/line-variable-store";
import { calendarLabel, nextBillingDate } from "@/lib/line-variables";

export default async function VariablesPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  await requirePermission("settings.connections");
  const params = await searchParams;
  const variables = listLineVariables();
  const sample = nextBillingDate("", variables.find((item) => item.key === "billing_days")?.adminValue || "30");
  return (
    <>
      <span className="eyebrow">Integrations</span>
      <h2>Line variables</h2>
      <p>These values are sent when a customer line account is created. Choose who can set each one. When both the team and the customer can set it, a value saved here is the one that is used.</p>
      {params.saved ? <p className="form-feedback">Line variables saved.</p> : null}
      <p>A payment today with the saved billing days would next bill on {calendarLabel(sample)}.</p>
      <form className="contact-form" action={saveLineVariables}>
        {variables.map((item) => (
          <fieldset key={item.key} className="feature-card" style={{ marginBottom: 16 }}>
            <h3>{item.label}</h3>
            <p>{item.detail}</p>
            <label>
              Team value
              {item.kind === "days"
                ? <input name={`value_${item.key}`} type="number" min={1} max={365} defaultValue={item.adminValue} placeholder="30" />
                : <input name={`value_${item.key}`} defaultValue={item.adminValue} />}
            </label>
            <label>
              Who can set this
              <select name={`audience_${item.key}`} defaultValue={item.audience}>
                <option value="admin">Team only</option>
                <option value="customer">Customer</option>
                <option value="both">Both, and the team value wins</option>
              </select>
            </label>
          </fieldset>
        ))}
        <button className="btn btn-primary" type="submit">Save line variables</button>
      </form>
    </>
  );
}
