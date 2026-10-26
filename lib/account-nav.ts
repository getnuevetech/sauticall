export const accountNav = [
  { href: "/account", label: "Overview", icon: "home", exact: true },
  { href: "/account/numbers", label: "Phone numbers", icon: "phone", exact: false },
  { href: "/account/phone", label: "Phone system", icon: "server", exact: false },
  { href: "/account/ai", label: "AI receptionist", icon: "spark", exact: false },
  { href: "/account/minutes", label: "Calls & voicemail", icon: "mic", exact: false },
  { href: "/account/billing", label: "Usage & billing", icon: "calendar", exact: false },
  { href: "/account/tickets", label: "Support", icon: "headset", exact: false },
  { href: "/account/security", label: "Settings", icon: "settings", exact: false },
] as const;

export function workspaceCrumb(pathname: string) {
  if (pathname === "/account") return { parent: "Workspace", current: "Overview" };
  if (pathname.startsWith("/account/billing")) return { parent: "Account", current: "Usage & billing" };
  if (pathname.startsWith("/account/verify")) return { parent: "Account", current: "Confirm account" };
  const match = accountNav.find((item) => item.href !== "/account" && (pathname === item.href || pathname.startsWith(`${item.href}/`)));
  return { parent: "Account", current: match?.label || "Account" };
}

export function navIsActive(pathname: string, href: string, exact: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
