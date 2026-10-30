import Link from "next/link";

export function AiSectionNav({ current }: { current: "system" | "terms" | "access" }) {
  const links = [
    ["system", "/admin/ai", "Engines"],
    ["terms", "/admin/ai/terms", "Agreements"],
    ["access", "/admin/ai/access", "Customer access"],
  ] as const;
  return (
    <nav className="ops-tabs">
      {links.map(([id, href, label]) => <Link key={id} href={href} data-current={current === id ? "true" : undefined}>{label}</Link>)}
    </nav>
  );
}
