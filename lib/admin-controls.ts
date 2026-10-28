export type FlagRecord = { key: string; label: string; description: string; enabled: boolean };

const GROUPS = [
  { id: "access", label: "Access & security", keys: ["auth.signup", "auth.password_login", "auth.mfa", "auth.test_code", "auth.show_sign_in"] },
  { id: "phone", label: "Phone operations", keys: ["numbers.search", "numbers.live_search", "numbers.live_order", "numbers.auto_order", "porting.requests", "porting.live_submit", "pbx.live_provision", "pbx.live_trunk", "minutes.live_sync", "minutes.enforce"] },
  { id: "payments", label: "Payments", keys: ["billing.checkout", "billing.fund_client"] },
  { id: "ai", label: "AI features", keys: ["marketing.ai_demo", "marketing.estimator", "contact.form", "sales.custom_request"] },
] as const;

export function flagGroups(flags: FlagRecord[]) {
  const used = new Set<string>();
  const grouped: { id: string; label: string; rows: FlagRecord[] }[] = GROUPS.map((group) => {
    const rows = group.keys.flatMap((key) => {
      const found = flags.find((flag) => flag.key === key);
      if (!found) return [];
      used.add(key);
      return [found];
    });
    return { id: group.id, label: group.label, rows };
  }).filter((group) => group.rows.length > 0);
  const rest = flags.filter((flag) => !used.has(flag.key));
  if (rest.length) grouped.push({ id: "other", label: "Other controls", rows: rest });
  return grouped;
}

export function flagsDirty(saved: FlagRecord[], pending: FlagRecord[]) {
  return saved.some((flag, index) => flag.enabled !== pending[index]?.enabled);
}

export function mfaChanged(saved: FlagRecord[], pending: FlagRecord[]) {
  const before = saved.find((flag) => flag.key === "auth.mfa")?.enabled;
  const after = pending.find((flag) => flag.key === "auth.mfa")?.enabled;
  return before !== after;
}
