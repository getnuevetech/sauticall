import { regionAllowed } from "./places.ts";

export type EmergencyAddress = {
  full_name: string;
  street_number: string;
  street_name: string;
  address_type: string;
  address_number: string;
  city: string;
  state: string;
  country: "US" | "CA";
  zip: string;
  language: "EN" | "FR";
};

export const unitTypes = [
  { value: "", label: "House or street address only" },
  { value: "APT", label: "Apartment" },
  { value: "STE", label: "Suite" },
  { value: "FL", label: "Floor" },
  { value: "UNIT", label: "Unit" },
  { value: "RM", label: "Room" },
  { value: "BLDG", label: "Building" },
];

export function parseEmergency(input: Record<string, string>): { ok: true; address: EmergencyAddress } | { ok: false; message: string } {
  const country = input.country === "CA" ? "CA" : input.country === "US" ? "US" : "";
  const zipRaw = (input.zip || "").trim().toUpperCase();
  const zip = country === "CA" ? zipRaw.replace(/\s+/g, "") : zipRaw.replace(/[^0-9]/g, "");
  const address: EmergencyAddress = {
    full_name: (input.full_name || "").trim().slice(0, 80),
    street_number: (input.street_number || "").replace(/\D/g, "").slice(0, 10),
    street_name: (input.street_name || "").trim().slice(0, 80),
    address_type: unitTypes.some((item) => item.value === input.address_type) ? input.address_type : "",
    address_number: (input.address_number || "").replace(/\D/g, "").slice(0, 10),
    city: (input.city || "").trim().slice(0, 80),
    state: (input.state || "").trim().toUpperCase().slice(0, 2),
    country: country === "CA" ? "CA" : "US",
    zip,
    language: input.language === "FR" ? "FR" : "EN",
  };
  if (!address.full_name) return { ok: false, message: "Enter the name emergency services should ask for." };
  if (!address.street_number) return { ok: false, message: "Enter the street number, using digits such as 1200." };
  if (!address.street_name) return { ok: false, message: "Enter the street name." };
  if (!address.city) return { ok: false, message: "Choose a city." };
  if (!country) return { ok: false, message: "Choose the United States or Canada." };
  if (!regionAllowed(country, address.state)) return { ok: false, message: "Choose a state or province." };
  if (country === "US" && !/^\d{5}(\d{4})?$/.test(address.zip)) return { ok: false, message: "Enter a 5-digit ZIP code." };
  if (country === "CA" && !/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(address.zip)) return { ok: false, message: "Enter a Canadian postal code." };
  if (input.address_number && !address.address_number) return { ok: false, message: "The apartment or suite number should be digits." };
  if (address.address_number && !address.address_type) return { ok: false, message: "Choose apartment, suite, floor, unit, room, or building." };
  return { ok: true, address };
}

export function addressReady(address: Pick<EmergencyAddress, "street_number" | "street_name" | "city" | "state" | "country" | "zip"> | null) {
  if (!address) return false;
  return Boolean(address.street_number && address.street_name && address.city && address.state && (address.country === "US" || address.country === "CA") && address.zip);
}

export function formatAddress(address: EmergencyAddress) {
  const unit = address.address_type && address.address_number ? ` ${address.address_type} ${address.address_number}` : "";
  const zipText = typeof address.zip === "string" ? address.zip : "";
  const zip = address.country === "CA" ? `${zipText.slice(0, 3)} ${zipText.slice(3)}`.trim() : zipText;
  return `${address.full_name || ""}, ${address.street_number || ""} ${address.street_name || ""}${unit}, ${address.city || ""}, ${address.state || ""} ${zip}`.replace(/\s+,/g, ",").trim();
}

export function emergencyCarrierParams(address: EmergencyAddress, did: string) {
  const params: Record<string, string> = {
    did,
    full_name: address.full_name,
    street_number: address.street_number,
    street_name: address.street_name,
    city: address.city,
    state: address.state,
    country: address.country,
    address_type: address.address_type,
    address_number: address.address_number,
    zip: address.zip,
    zip_code: address.zip,
  };
  if (address.country === "CA") params.language = address.language;
  return params;
}
