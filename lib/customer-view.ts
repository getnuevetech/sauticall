export type CustomerSearch = { code: string; company: string; contact: string; email: string; phone: string; plan: string };
export type CustomerFilters = { q: string; plan: string; signin: string };

export function matchesCustomer(row: CustomerSearch, filters: CustomerFilters) {
  const needle = filters.q.trim().toLowerCase();
  const digits = filters.q.replace(/\D/g, "");
  if (needle) {
    const hay = `${row.code} ${row.company} ${row.contact} ${row.email} ${row.plan}`.toLowerCase();
    const phone = row.phone.replace(/\D/g, "");
    if (!hay.includes(needle) && !(digits.length >= 3 && phone.includes(digits))) return false;
  }
  if (filters.plan === "none" && row.plan !== "No paid plan") return false;
  if (filters.plan && filters.plan !== "all" && filters.plan !== "none" && row.plan !== filters.plan) return false;
  return true;
}

type Address = {
  street_number: string;
  street_name: string;
  address_type: string;
  address_number: string;
  city: string;
  state: string;
  country: string;
  zip: string;
};

export function contactLines(address: Address | null) {
  if (!address || !address.street_number || !address.street_name || !address.city || !address.state || !address.zip) return [];
  if (address.country !== "US" && address.country !== "CA") return [];
  const units: Record<string, string> = { APT: "Apt", STE: "Suite", FL: "Floor", UNIT: "Unit", RM: "Room", BLDG: "Building" };
  const unit = address.address_type && address.address_number ? `${units[address.address_type] || address.address_type} ${address.address_number}` : "";
  const zip = address.country === "CA" ? `${address.zip.slice(0, 3)} ${address.zip.slice(3)}`.trim() : address.zip;
  return [
    `${address.street_number} ${address.street_name}`.trim(),
    unit,
    `${address.city}, ${address.state} ${zip}`.trim(),
    address.country === "CA" ? "Canada" : "United States",
  ].filter(Boolean);
}
