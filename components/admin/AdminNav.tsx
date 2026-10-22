"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const GROUPS = [
  {
    title: "Website",
    links: [
      ["Home", "/admin/content/page.home"],
      ["Solutions", "/admin/content/page.solutions"],
      ["AI receptionist", "/admin/content/page.ai"],
      ["How it works", "/admin/content/page.how"],
      ["Pricing", "/admin/content/page.pricing"],
      ["About", "/admin/content/page.about"],
      ["Contact", "/admin/content/page.contact"],
      ["Custom plan", "/admin/content/page.custom"],
      ["Menu", "/admin/content/nav"],
      ["Footer", "/admin/content/footer"],
      ["Services", "/admin/content/services"],
      ["Plans", "/admin/content/plans"],
      ["Questions", "/admin/content/faqs"],
      ["Who it's for", "/admin/content/personas"],
    ],
  },
  {
    title: "Account",
    links: [["Account wording", "/admin/content/page.account"]],
  },
  {
    title: "Settings",
    links: [
      ["Colors and font", "/admin/theme"],
      ["What customers can do", "/admin/flags"],
      ["Payments", "/admin/gateways"],
      ["Phone connections", "/admin/connections"],
      ["Extensions", "/admin/phone"],
    ],
  },
  {
    title: "Inbox",
    links: [
      ["Messages", "/admin/messages"],
      ["Number and transfer requests", "/admin/requests"],
      ["Images", "/admin/media"],
    ],
  },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav aria-label="Admin">
      <div className="admin-nav-group">
        <Link href="/admin" data-current={path === "/admin" ? "true" : undefined}>Overview</Link>
      </div>
      {GROUPS.map((group) => (
        <div key={group.title} className="admin-nav-group">
          <h4>{group.title}</h4>
          {group.links.map(([label, href]) => (
            <Link key={href} href={href} data-current={path === href ? "true" : undefined}>{label}</Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
