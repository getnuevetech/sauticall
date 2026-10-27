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
      <body>
        <script dangerouslySetInnerHTML={{ __html: "document.addEventListener('click',function(e){var t=e.target;if(!t||!t.closest)return;var n=t.closest('a[href],button');if(!n)return;if(n.tagName==='BUTTON'&&(n.disabled||n.getAttribute('type')==='button'))return;if(n.tagName==='A'){var h=n.getAttribute('href')||'';if(!h||h.charAt(0)==='#'||n.getAttribute('target')==='_blank')return;}document.documentElement.setAttribute('data-busy','1');},true);window.addEventListener('pageshow',function(){document.documentElement.removeAttribute('data-busy');});" }} />
        <ClickAck />
        {children}
      </body>
    </html>
  );
}
