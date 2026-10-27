"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

export function ClickAck() {
  const pathname = usePathname();
  useEffect(() => {
    document.documentElement.removeAttribute("data-busy");
  }, [pathname]);
  useEffect(() => {
    let timer = 0;
    const onClick = (event: MouseEvent) => {
      const node = event.target instanceof Element ? event.target.closest("a[href], button") : null;
      if (!node || (node instanceof HTMLButtonElement && node.disabled)) return;
      document.documentElement.setAttribute("data-busy", "1");
      window.clearTimeout(timer);
      timer = window.setTimeout(() => document.documentElement.removeAttribute("data-busy"), 8000);
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.clearTimeout(timer);
    };
  }, []);
  return <style>{`html[data-busy]::before{content:"";position:fixed;z-index:80;top:0;left:0;height:3px;width:35%;background:#354bc8;pointer-events:none;animation:sc-busy .8s ease-out infinite}@keyframes sc-busy{50%{width:70%;left:15%}100%{width:35%;left:65%}}`}</style>;
}
