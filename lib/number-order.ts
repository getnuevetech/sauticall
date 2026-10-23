export function numberPurchaseMode(ordering: boolean, automatic: boolean) {
  if (!ordering) return "off" as const;
  return automatic ? "automatic" as const : "manual" as const;
}
