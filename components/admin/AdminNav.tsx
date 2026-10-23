"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AdminNav({ groups }: { groups: { title: string; links: { label: string; href: string }[] }[] }) {
  const path = usePathname();
  const hrefs = groups.flatMap((group) => group.links.map((link) => link.href));
  const current = (href: string) => {
    if (href === "/admin") return path === "/admin";
    const matches = path === href || path.startsWith(`${href}/`);
    if (!matches) return false;
    return !hrefs.some((other) => other !== href && other.startsWith(`${href}/`) && (path === other || path.startsWith(`${other}/`)));
  };
  return (
    <nav aria-label="Admin">
      <div className="admin-nav-group">
        <Link href="/admin" data-current={path === "/admin" ? "true" : undefined}>Home</Link>
      </div>
      {groups.map((group) => (
        <div key={group.title} className="admin-nav-group">
          <h4>{group.title}</h4>
          {group.links.map((link) => (
            <Link key={link.href} href={link.href} data-current={current(link.href) ? "true" : undefined}>{link.label}</Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
