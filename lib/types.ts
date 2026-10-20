export type NavLink = { label: string; href: string; location: "header" | "mobile" | "footer" | "account"; group?: string };

export type Service = {
  icon: string;
  tag: string;
  title: string;
  desc: string;
  short: string;
  href: string;
  cardColor: string;
};

export type Plan = {
  name: string;
  price: number;
  desc: string;
  units: string;
  features: string[];
  note: string;
  popular: boolean;
  ctaLabel: string;
  ctaHref: string;
};

export type Faq = { q: string; a: string };

export type Persona = { index: string; title: string; body: string; cta: string; href: string };

export type Flag = { key: string; label: string; description: string; enabled: boolean };

export type Theme = {
  fontFamily: string;
  fontStylesheetUrl: string;
  logoUrl: string;
  primary: string;
  primaryHover: string;
  ink: string;
  muted: string;
  canvas: string;
  coral: string;
  ctaBand: string;
  ctaButton: string;
  footer: string;
};

export type Gateway = {
  id: number;
  name: string;
  provider_key: string;
  public_label: string;
  enabled: number;
  priority: number;
  mode: "test" | "live";
  currencies: string;
  config_json: string;
};

export type SiteBundle = {
  nav: NavLink[];
  footer: {
    blurb: string;
    mini: string;
    groups: { title: string; links: { label: string; href: string }[] }[];
    legalLeft: string;
    legalRight: string;
  };
  services: Service[];
  plans: Plan[];
  faqs: Faq[];
  personas: Persona[];
  flags: Flag[];
  theme: Theme;
  pages: Record<string, Record<string, unknown>>;
};
