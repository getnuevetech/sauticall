import type { Theme } from "./types";
import { defaultTheme } from "./seed-data";

function cssValue(value: string, fallback: string) {
  return /^[#a-zA-Z0-9 ,.'"-]+$/.test(value) ? value : fallback;
}

export function themeStyle(theme: Theme) {
  const safe: Theme = {
    ...theme,
    fontFamily: cssValue(theme.fontFamily, defaultTheme.fontFamily),
    primary: cssValue(theme.primary, defaultTheme.primary),
    primaryHover: cssValue(theme.primaryHover, defaultTheme.primaryHover),
    ink: cssValue(theme.ink, defaultTheme.ink),
    muted: cssValue(theme.muted, defaultTheme.muted),
    canvas: cssValue(theme.canvas, defaultTheme.canvas),
    coral: cssValue(theme.coral, defaultTheme.coral),
    ctaBand: cssValue(theme.ctaBand, defaultTheme.ctaBand),
    ctaButton: cssValue(theme.ctaButton, defaultTheme.ctaButton),
    footer: cssValue(theme.footer, defaultTheme.footer),
  };
  const changed = (Object.keys(defaultTheme) as (keyof Theme)[]).some((key) => key !== "fontStylesheetUrl" && key !== "logoUrl" && safe[key] !== defaultTheme[key]);
  const fontRule = safe.fontFamily ? `body, button, input, textarea, select { font-family: ${safe.fontFamily}; }` : "";
  if (!changed) return fontRule;
  return `
    ${fontRule}
    body { background: ${safe.canvas}; color: ${safe.ink}; }
    p { color: ${safe.muted}; }
    .btn-primary { background: ${safe.primary}; }
    .btn-primary:hover { background: ${safe.primaryHover}; }
    .brand-accent, .text-link, .desktop-nav a:hover, .desktop-nav a.active, em { color: ${safe.primary}; }
    .brand-mark { background: ${safe.primary}; border-color: ${safe.primary}; }
    .end-cta { background: ${safe.ctaBand}; }
    .end-cta .btn-primary { background: ${safe.ctaButton}; color: #2a3265; }
    .site-footer { background: ${safe.footer}; }
    .starlet, .site-footer .brand-accent { color: ${safe.coral}; }
    .site-footer .brand-mark { background: ${safe.coral}; border-color: ${safe.coral}; }
  `;
}
