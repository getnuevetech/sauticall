const ICONS: Record<string, string> = {
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.35 1.91.69 2.82a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.26-1.26a2 2 0 0 1 2.11-.45c.91.34 1.86.57 2.82.69A2 2 0 0 1 22 16.92Z"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5m-5 0h10"/>',
  bot: '<rect x="3" y="7" width="18" height="14" rx="4"/><path d="M12 2v5M9 3h6M8 13h.01M16 13h.01M9 17h6"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  checkcircle: '<circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
  message: '<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 8.1 8.1 0 0 1-4-.96L3 21l1.96-5.5a8.1 8.1 0 0 1-.96-4A8.5 8.5 0 0 1 12.5 3 8.5 8.5 0 0 1 21 11.5Z"/>',
  headset: '<path d="M3 14v-3a9 9 0 0 1 18 0v3M3 14v3a2 2 0 0 0 2 2h2v-7H5a2 2 0 0 0-2 2Zm18 0v3a2 2 0 0 1-2 2h-2v-7h2a2 2 0 0 1 2 2ZM17 19a5 5 0 0 1-5 3h-2"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06-2.12 2.12-.06-.06A1.65 1.65 0 0 0 15.8 18.6l-.27.1-.3 2.3h-3l-.3-2.3-.27-.1a1.65 1.65 0 0 0-1.82.33l-.06.06-2.12-2.12.06-.06A1.65 1.65 0 0 0 8.06 15l-.1-.27-2.3-.3v-3l2.3-.3.1-.27a1.65 1.65 0 0 0-.33-1.82L7.67 9 9.8 6.87l.06.06a1.65 1.65 0 0 0 1.82.33l.27-.1.3-2.3h3l.3 2.3.27.1a1.65 1.65 0 0 0 1.82-.33l.06-.06L19.8 9l-.06.06A1.65 1.65 0 0 0 19.4 11l.1.27 2.3.3v3l-2.3.3Z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m18 0v-2a4 4 0 0 0-3-3.87M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8-7.87a4 4 0 0 1 0 7.75"/>',
  smartphone: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
  arrowdown: '<path d="m6 9 6 6 6-6"/>',
  zap: '<path d="m13 2-9 12h7l-1 8 10-12h-7l0-8Z"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
  server: '<rect x="3" y="3" width="18" height="8" rx="2"/><rect x="3" y="13" width="18" height="8" rx="2"/><path d="M7 7h.01M7 17h.01"/>',
  spark: '<path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4L12 3Z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  download: '<path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M4 21h16"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>',
  chart: '<path d="M4 20V10M12 20V4M20 20v-7M3 20h18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2" fill="currentColor"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 7 9-7"/>',
};

export const iconNames = Object.keys(ICONS);

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const markup = ICONS[name] || ICONS.spark;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
