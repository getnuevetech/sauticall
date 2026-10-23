export function planSignupPath(name: string, setup = "") {
  const params = new URLSearchParams({ plan: name });
  const note = setup.trim().slice(0, 400);
  if (note) params.set("setup", note);
  return `/account/register?${params.toString()}`;
}

const BROCHURE = new Set(["", "/", "/how-it-works", "/contact", "#"]);

export function signupHref(href: string) {
  if (BROCHURE.has(href)) return "/account/register";
  return href;
}
