"use client";

import { useState, type ReactNode } from "react";
import { PlaceSelects } from "./PlaceSelects";

const UNITS = [
  { value: "", label: "House or street address only" },
  { value: "APT", label: "Apartment" },
  { value: "STE", label: "Suite" },
  { value: "FL", label: "Floor" },
  { value: "UNIT", label: "Unit" },
  { value: "RM", label: "Room" },
  { value: "BLDG", label: "Building" },
];

type AddressValues = {
  full_name: string;
  street_number: string;
  street_name: string;
  address_type: string;
  address_number: string;
  city: string;
  state: string;
  country: string;
  zip: string;
};

type Suggestion = { id: string; label: string };

export function AddressEditor({
  action,
  next,
  defaults,
  lookup,
  submitLabel,
  header,
  className,
  onClick,
}: {
  action: (formData: FormData) => void | Promise<void>;
  next: string;
  defaults: AddressValues;
  lookup: boolean;
  submitLabel: string;
  header?: ReactNode;
  className?: string;
  onClick?: (event: React.MouseEvent<HTMLFormElement>) => void;
}) {
  const [values, setValues] = useState(defaults);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [note, setNote] = useState(lookup ? "" : "Google address lookup is not configured. Enter the address below.");
  const [busy, setBusy] = useState(false);

  function setField(key: keyof AddressValues, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function search() {
    setBusy(true);
    setNote("");
    try {
      const response = await fetch(`/api/address?q=${encodeURIComponent(query)}`);
      const payload = await response.json() as { suggestions?: Suggestion[]; message?: string };
      setSuggestions(payload.suggestions || []);
      setNote(payload.message || "");
    } catch {
      setSuggestions([]);
      setNote("Google address lookup is not available right now.");
    } finally {
      setBusy(false);
    }
  }

  async function choose(id: string) {
    setBusy(true);
    setNote("");
    try {
      const response = await fetch(`/api/address?place=${encodeURIComponent(id)}`);
      const payload = await response.json() as { address?: Omit<AddressValues, "full_name">; message?: string };
      if (payload.address) {
        setValues((current) => ({ ...current, ...payload.address }));
        setSuggestions([]);
        setNote("Address filled from Google. Check it, then save. Saving also updates the VoIP.ms client.");
      } else {
        setNote(payload.message || "Google did not return a complete street address.");
      }
    } catch {
      setNote("Google address lookup is not available right now.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={className} action={action} onClick={onClick}>
      {header}
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="language" value="EN" />
      <p>{lookup ? "Search with Google for a complete street address, then save. Saving updates this account and the VoIP.ms client address." : "Enter the street, city, state, and postal code. Saving updates this account and the VoIP.ms client address."}</p>
      {lookup ? (
        <label>Search address
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Start typing a street address" autoComplete="off" />
        </label>
      ) : null}
      {lookup ? <button className="ws-btn ghost" type="button" disabled={busy} onClick={() => void search()}>{busy ? "Looking up…" : "Find address"}</button> : null}
      {suggestions.length ? (
        <ul>
          {suggestions.map((item) => <li key={item.id}><button type="button" onClick={() => void choose(item.id)}>{item.label}</button></li>)}
        </ul>
      ) : null}
      {note ? <p className="form-feedback">{note}</p> : null}
      <label>Contact name <input name="full_name" value={values.full_name} onChange={(event) => setField("full_name", event.target.value)} required /></label>
      <label>Street number <input name="street_number" value={values.street_number} onChange={(event) => setField("street_number", event.target.value)} required /></label>
      <label>Street name <input name="street_name" value={values.street_name} onChange={(event) => setField("street_name", event.target.value)} required /></label>
      <label>Unit type
        <select name="address_type" value={values.address_type} onChange={(event) => setField("address_type", event.target.value)}>
          {UNITS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      <label>Unit number <input name="address_number" value={values.address_number} onChange={(event) => setField("address_number", event.target.value)} /></label>
      <PlaceSelects
        key={`${values.country}-${values.state}`}
        countryLabel="Country"
        regionLabel="State"
        cityLabel="City"
        includeCity={false}
        countryDefault={values.country || "US"}
        regionDefault={values.state}
      />
      <label>City <input name="city" value={values.city} onChange={(event) => setField("city", event.target.value)} required /></label>
      <label>ZIP or postal code <input name="zip" value={values.zip} onChange={(event) => setField("zip", event.target.value)} required /></label>
      <button className="ws-btn primary" type="submit">{submitLabel}</button>
    </form>
  );
}
