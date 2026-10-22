"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AdminNav({ groups }: { groups: { title: string; links: { label: string; href: string }[] }[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Admin">
      <div className="admin-nav-group">
        <Link href="/admin" data-current={path === "/admin" ? "true" : undefined}>Home</Link>
      </div>
      {groups.map((group) => (
        <div key={group.title} className="admin-nav-group">
          <h4>{group.title}</h4>
          {group.links.map((link) => (
            <Link key={link.href} href={link.href} data-current={path === link.href ? "true" : undefined}>{link.label}</Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
