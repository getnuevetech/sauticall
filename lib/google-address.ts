export type GoogleComponent = {
  longText?: string;
  shortText?: string;
  long_name?: string;
  short_name?: string;
  types?: string[];
};

export type GoogleStreet = {
  street_number: string;
  street_name: string;
  address_type: string;
  address_number: string;
  city: string;
  state: string;
  country: "US" | "CA";
  zip: string;
};

function text(component: GoogleComponent | undefined, short = false) {
  if (!component) return "";
  const value = short ? component.shortText || component.short_name : component.longText || component.long_name;
  return String(value || "").trim();
}

function find(components: GoogleComponent[], type: string) {
  return components.find((component) => (component.types || []).includes(type));
}

function unitType(value: string) {
  if (/apartment|\bapt\b/i.test(value)) return "APT";
  if (/suite|\bste\b/i.test(value)) return "STE";
  if (/floor|\bfl\b/i.test(value)) return "FL";
  if (/room|\brm\b/i.test(value)) return "RM";
  if (/building|\bbldg\b/i.test(value)) return "BLDG";
  return value.replace(/\D/g, "") ? "UNIT" : "";
}

export function parseGoogleAddress(components: GoogleComponent[]): { ok: true; address: GoogleStreet } | { ok: false; message: string } {
  const country = text(find(components, "country"), true).toUpperCase();
  if (country !== "US" && country !== "CA") return { ok: false, message: "Choose a United States or Canada address." };
  const streetNumber = text(find(components, "street_number")).replace(/\D/g, "").slice(0, 10);
  const streetName = text(find(components, "route")).slice(0, 80);
  const city = (text(find(components, "locality")) || text(find(components, "postal_town")) || text(find(components, "sublocality"))).slice(0, 80);
  const state = text(find(components, "administrative_area_level_1"), true).toUpperCase().slice(0, 2);
  const zip = text(find(components, "postal_code")).toUpperCase().replace(/\s+/g, "").slice(0, 10);
  const unit = text(find(components, "subpremise"));
  const address: GoogleStreet = {
    street_number: streetNumber,
    street_name: streetName,
    address_type: unitType(unit),
    address_number: unit.replace(/\D/g, "").slice(0, 10),
    city,
    state,
    country,
    zip,
  };
  if (!address.street_number || !address.street_name || !address.city || !address.state || !address.zip) {
    return { ok: false, message: "Google did not return a complete street address. Enter the missing parts." };
  }
  if (address.address_number && !address.address_type) address.address_type = "UNIT";
  return { ok: true, address };
}
