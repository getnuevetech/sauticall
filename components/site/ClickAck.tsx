"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

export function ClickAck() {
  const pathname = usePathname();
  useEffect(() => {
    document.documentElement.removeAttribute("data-busy");
  }, [pathname]);
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const node = event.target instanceof Element ? event.target.closest("a[href], button") : null;
      if (!node || (node instanceof HTMLButtonElement && (node.disabled || node.type === "button"))) return;
      if (node instanceof HTMLAnchorElement) {
        const href = node.getAttribute("href") || "";
        if (!href || href.startsWith("#") || node.target === "_blank") return;
      }
      document.documentElement.setAttribute("data-busy", "1");
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return <style>{`html[data-busy]::before{content:"";position:fixed;z-index:200;top:0;left:0;height:3px;width:100%;background:#2f5bff;pointer-events:none;transform-origin:0 0;animation:sc-busy 1.1s ease-out forwards}@keyframes sc-busy{from{transform:scaleX(.12)}to{transform:scaleX(.92)}}`}</style>;
}
