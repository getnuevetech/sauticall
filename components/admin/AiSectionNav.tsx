import Link from "next/link";

export function AiSectionNav({ current }: { current: "system" | "terms" | "access" | "audio" | "notify" | "route" | "destinations" }) {
  const links = [
    ["system", "/admin/ai", "Engines"],
    ["destinations", "/admin/ai/destinations", "Virtual destinations"],
    ["terms", "/admin/ai/terms", "Agreements"],
    ["access", "/admin/ai/access", "Customer access"],
    ["audio", "/admin/ai/audio", "Audio"],
    ["notify", "/admin/ai/notify", "Notifications"],
    ["route", "/admin/ai/route", "Outbound"],
  ] as const;
  return (
    <nav className="ops-tabs">
      {links.map(([id, href, label]) => <Link key={id} href={href} data-current={current === id ? "true" : undefined}>{label}</Link>)}
    </nav>
  );
}
