"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { saveEmergencyAddress, saveNumber } from "@/app/account/actions";
import { formatPhone, monthlyPrice } from "@/lib/account-display";
import { Icon } from "@/components/Icon";
import { PlaceSelects } from "./PlaceSelects";

type Did = { did: string; ratecenter: string; state: string; monthly: string };
type Owned = { did: string; status: string; detail: string };
type Requested = { id: number; did: string; status: string; where: string };
type AddressDefaults = {
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

const MATCHES = [
  { id: "number", label: "Exact number" },
  { id: "prefix", label: "Starts with" },
  { id: "suffix", label: "Ends with" },
] as const;

const UNITS = [
  { value: "", label: "Unit type" },
  { value: "APT", label: "Apartment" },
  { value: "STE", label: "Suite" },
  { value: "FL", label: "Floor" },
  { value: "UNIT", label: "Unit" },
  { value: "RM", label: "Room" },
  { value: "BLDG", label: "Building" },
];

function placeLabel(value: string) {
  return value.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function BuyButton({ ready }: { ready: boolean }) {
  const { pending } = useFormStatus();
  return <button className="ws-btn primary" type="submit" disabled={!ready || pending} aria-busy={pending}>{pending ? "Buying…" : "Buy this number"}</button>;
}

export function PhoneNumbers({
  live,
  included,
  closed,
  hasAddress,
  addressLine,
  defaults,
  owned,
  requests,
  notice,
}: {
  live: boolean;
  included: boolean;
  closed: boolean;
  hasAddress: boolean;
  addressLine: string;
  defaults: AddressDefaults;
  owned: Owned[];
  requests: Requested[];
  notice: string;
}) {
  const [tab, setTab] = useState<"mine" | "find" | "e911">("find");
  const [match, setMatch] = useState<"" | "number" | "prefix" | "suffix">("");
  const [dids, setDids] = useState<Did[]>([]);
  const [selected, setSelected] = useState<Did | null>(null);
  const [message, setMessage] = useState("");
  const router = useRouter();
  const refreshes = useRef(0);
  const buying = requests.some((row) => row.status === "Buying");
  useEffect(() => {
    if (!buying || refreshes.current >= 6) return;
    const timer = window.setTimeout(() => {
      refreshes.current += 1;
      router.refresh();
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [buying, requests, router]);
  const [pending, setPending] = useState(false);
  const [sort, setSort] = useState<"low" | "high">("low");
  const [page, setPage] = useState(1);
  const [where, setWhere] = useState("");
  const [addressOpen, setAddressOpen] = useState(false);
  const [country, setCountry] = useState(defaults.country || "US");

  const sorted = useMemo(() => {
    const copy = [...dids];
    copy.sort((a, b) => {
      const left = Number(a.monthly) || 0;
      const right = Number(b.monthly) || 0;
      return sort === "low" ? left - right : right - left;
    });
    return copy;
  }, [dids, sort]);
  const pageSize = 8;
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const shown = sorted.slice((page - 1) * pageSize, page * pageSize);

  async function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!live) return;
    const data = new FormData(event.currentTarget);
    const query = String(data.get("query") || "").trim();
    const searchBy = String(data.get("searchBy") || "city");
    if (searchBy === "pattern" && !query) {
      setMessage("Enter an area code or number pattern.");
      setDids([]);
      setSelected(null);
      setPending(false);
      return;
    }
    const mode = searchBy === "pattern" || query ? match || "prefix" : "city";
    const region = String(data.get("region") || "");
    const city = String(data.get("ratecenter") || "");
    const params = new URLSearchParams({
      country: String(data.get("country") || "US"),
      region,
      ratecenter: city,
      mode,
      query,
    });
    setPending(true);
    setPage(1);
    const response = await fetch(`/api/numbers/search?${params}`);
    const payload = (await response.json()) as { dids?: Did[]; message?: string };
    const next = payload.dids || [];
    setDids(next);
    setSelected(next[0] || null);
    setCountry(String(data.get("country") || "US"));
    setWhere([placeLabel(city), region].filter(Boolean).join(", "));
    setMessage(payload.message || (next.length ? "" : "No numbers matched that search."));
    setPending(false);
  }

  return (
    <div className="num-page">
      <header className="num-head">
        <div>
          <h1>Phone numbers</h1>
          <p>Find a business number and manage your emergency address.</p>
        </div>
        <Link className="ws-btn ghost num-outline" href="/account/porting">Transfer a number</Link>
      </header>
      {notice ? <p className="form-feedback">{notice}</p> : null}
      <div className="num-tabs">
        <button type="button" className={tab === "mine" ? "active" : ""} onClick={() => setTab("mine")}>My numbers</button>
        <button type="button" className={tab === "find" ? "active" : ""} onClick={() => setTab("find")}>Find a number</button>
        <button type="button" className={tab === "e911" ? "active" : ""} onClick={() => setTab("e911")}>E911 addresses</button>
      </div>

      {tab === "mine" ? (
        <section className="num-card">
          <h2>My numbers</h2>
          {owned.length === 0 && requests.length === 0 ? <p>You have not added a number yet. Find one, or transfer a number you already have.</p> : null}
          {owned.map((line) => (
            <p key={line.did}><strong>{formatPhone(line.did)}</strong> · {line.status}{line.detail ? ` · ${line.detail}` : ""}</p>
          ))}
          {requests.map((row) => (
            <p key={row.id}><strong>{row.did ? formatPhone(row.did) : "Number request"}</strong> · {row.status} · {row.where}</p>
          ))}
        </section>
      ) : null}

      {tab === "e911" ? (
        <section className="num-card">
          <h2>Emergency address</h2>
          {hasAddress ? <p>{addressLine}</p> : <p>Add the physical location emergency services should use.</p>}
          <button className="ws-btn ghost" type="button" onClick={() => setAddressOpen(true)}>{hasAddress ? "Update address" : "Add address"}</button>
        </section>
      ) : null}

      {tab === "find" ? (
        <div className="num-layout">
          <div>
            {!hasAddress ? (
              <div className="num-alert">
                <span className="num-ico"><Icon name="shield" size={18} /></span>
                <div>
                  <strong>Emergency address not registered</strong>
                  <p>Add an address before completing your number order.</p>
                </div>
                <button className="ws-btn ghost num-outline" type="button" onClick={() => setAddressOpen(true)}>Add address</button>
              </div>
            ) : null}
            {!included ? <section className="num-card"><p>Business numbers are not included on your plan.</p></section> : null}
            {included && closed ? <section className="num-card"><p>Number search is turned off.</p></section> : null}
            {included && !closed ? (
              <section className="num-card">
                <h2>Find your next number</h2>
                <form onSubmit={onSearch}>
                  <div className="num-places">
                    <PlaceSelects countryLabel="Country" regionLabel="State" cityLabel="City" regionName="region" cityName="ratecenter" />
                  </div>
                  <div className="num-search-row">
                    <label>Search by
                      <select name="searchBy" defaultValue="city">
                        <option value="city">City</option>
                        <option value="pattern">Area code or number</option>
                      </select>
                    </label>
                    <label>Area code or number pattern
                      <input name="query" inputMode="numeric" autoComplete="off" placeholder="e.g. 302" />
                    </label>
                    <button className="ws-btn primary" type="submit" disabled={!live || pending}>{pending ? "Searching" : "Search numbers"}</button>
                  </div>
                  <div className="num-matches">
                    <span>Match type (optional)</span>
                    {MATCHES.map((item) => (
                      <button key={item.id} type="button" className={match === item.id ? "active" : ""} onClick={() => setMatch(match === item.id ? "" : item.id)}>{item.label}</button>
                    ))}
                  </div>
                </form>
                {!live ? <p>Number search is not available right now.</p> : null}
                {message ? <p className="form-feedback">{message}</p> : null}
              </section>
            ) : null}
            {included && !closed ? (
              <section className="num-card">
                <div className="num-results-head">
                  <div>
                    <h2>Available numbers</h2>
                    <p>{where ? `Results for ${where}` : "Search a city to see numbers."}</p>
                  </div>
                  <label className="num-sort">
                    <select aria-label="Sort by price" value={sort} onChange={(event) => { setSort(event.target.value === "high" ? "high" : "low"); setPage(1); }}>
                      <option value="low">Price: low to high</option>
                      <option value="high">Price: high to low</option>
                    </select>
                  </label>
                </div>
                <table className="num-table">
                  <thead><tr><th>Number</th><th>Location</th><th>Monthly</th><th /></tr></thead>
                  <tbody>
                    {shown.length === 0 ? <tr><td colSpan={4}>No numbers to show yet.</td></tr> : shown.map((item) => {
                      const active = selected?.did === item.did;
                      const location = [placeLabel(item.ratecenter), item.state].filter(Boolean).join(", ");
                      return (
                        <tr key={item.did} className={active ? "selected" : ""}>
                          <td>{formatPhone(item.did)}</td>
                          <td>{location || where}</td>
                          <td>{monthlyPrice(item.monthly) || "Shown at review"}</td>
                          <td><button type="button" className={active ? "ws-btn primary" : "ws-btn ghost num-outline"} onClick={() => setSelected(item)}>{active ? "Selected" : "Select"}</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="num-pager">
                  <span>{sorted.length} {sorted.length === 1 ? "result" : "results"}</span>
                  <div>
                    <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>‹</button>
                    <span className="current">{page}</span>
                    <button type="button" aria-label="Next page" disabled={page >= pages} onClick={() => setPage((value) => Math.min(pages, value + 1))}>›</button>
                  </div>
                </div>
                <p>Availability and final charges are confirmed before purchase.</p>
              </section>
            ) : null}
          </div>
          <aside>
            <section className="num-card num-selection">
              <h2>Your selection</h2>
              {selected ? (
                <>
                  <p className="num-selected">{formatPhone(selected.did)}</p>
                  <p>{[placeLabel(selected.ratecenter), selected.state].filter(Boolean).join(", ") || where}</p>
                  <div className="num-price-row"><span>Number rental</span><strong>{monthlyPrice(selected.monthly) ? `${monthlyPrice(selected.monthly)}/month` : "Shown at review"}</strong></div>
                  <div className="num-price-row"><span>Setup & E911 fees</span><span>Shown at review</span></div>
                  <div className="num-price-row"><span>Taxes</span><span>Shown at review</span></div>
                </>
              ) : <p>Select a number from the list.</p>}
              <div className="num-e911-line">
                <span>E911 address</span>
                {hasAddress ? <span className="ws-pill live">Saved</span> : <span className="num-required">Required</span>}
              </div>
              {hasAddress ? <p>{addressLine}</p> : <p>Add your physical service address to continue. <button type="button" className="num-link" onClick={() => setAddressOpen(true)}>Add emergency address</button></p>}
              {selected ? (
                <form action={saveNumber}>
                  <input type="hidden" name="did" value={selected.did} />
                  <input type="hidden" name="country" value={country} />
                  <input type="hidden" name="region" value={selected.state} />
                  <input type="hidden" name="ratecenter" value={selected.ratecenter} />
                  <input type="hidden" name="monthly" value={selected.monthly} />
                  <label className="check-option num-terms"><input name="number_terms" type="checkbox" required disabled={!hasAddress} /> I agree to the Terms of Service for this number.</label>
                  <BuyButton ready={hasAddress} />
                </form>
              ) : <button className="ws-btn" type="button" disabled>Buy this number</button>}
              <p>The button buys this number on your phone-company account.</p>
            </section>
            <section className="num-card num-transfer">
              <div className="num-transfer-title">
                <span className="num-ico"><Icon name="arrow" size={16} /></span>
                <h2>Already have a number?</h2>
              </div>
              <p>Keep your business number when you move to SautiCall.</p>
              <Link href="/account/porting">Start a transfer <Icon name="arrow" size={14} /></Link>
            </section>
          </aside>
        </div>
      ) : null}

      {addressOpen ? (
        <div className="num-modal-scrim" onClick={() => setAddressOpen(false)}>
          <form className="num-modal" action={saveEmergencyAddress} onClick={(event) => event.stopPropagation()}>
            <div className="num-modal-head">
              <div>
                <h2>Emergency address</h2>
                <p>Physical location for emergency services.</p>
              </div>
              <button type="button" aria-label="Close" onClick={() => setAddressOpen(false)}>×</button>
            </div>
            <label>Contact name <input name="full_name" defaultValue={defaults.full_name} placeholder="Contact name" required /></label>
            <div className="num-modal-grid">
              <label>Street number <input name="street_number" defaultValue={defaults.street_number} placeholder="e.g. 123" required /></label>
              <label>Street name <input name="street_name" defaultValue={defaults.street_name} placeholder="e.g. Main St" required /></label>
            </div>
            <label>Unit (optional)
              <span className="num-unit">
                <select name="address_type" defaultValue={defaults.address_type}>{UNITS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
                <input name="address_number" defaultValue={defaults.address_number} placeholder="e.g. Suite 200" />
              </span>
            </label>
            <div className="num-modal-places">
              <PlaceSelects
                countryLabel="Country"
                regionLabel="State"
                cityLabel="City"
                countryDefault={defaults.country || "US"}
                regionDefault={defaults.state}
                cityDefault={defaults.city}
              />
              <label>ZIP code <input name="zip" defaultValue={defaults.zip} placeholder="e.g. 19720" required /></label>
            </div>
            <input type="hidden" name="language" value="EN" />
            <button className="ws-btn primary" type="submit">Save address</button>
            <p>Registration status appears after submission.</p>
          </form>
        </div>
      ) : null}
    </div>
  );
}
