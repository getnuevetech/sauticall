import type { Metadata } from "next";
import "./design.css";
import "./public.css";
import { ClickAck } from "@/components/site/ClickAck";
import { loadSite } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const site = loadSite();
  const title = typeof site.home.metaTitle === "string" ? site.home.metaTitle : "SautiCall";
  const description = typeof site.home.metaDescription === "string" ? site.home.metaDescription : "";
  return { title, description };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><ClickAck />{children}</body>
    </html>
  );
}
