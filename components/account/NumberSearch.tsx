"use client";

import { FormEvent, useState } from "react";
import { saveNumber } from "@/app/account/actions";
import { PlaceSelects } from "./PlaceSelects";

type Did = { did: string; ratecenter: string; state: string; monthly: string };

const MODES = [
  ["city", "Numbers in this city"],
  ["number", "A specific number"],
  ["prefix", "Starts with"],
  ["suffix", "Ends with"],
] as const;

export function NumberSearch({
  live,
  automatic,
  copy,
}: {
  live: boolean;
  automatic: boolean;
  copy: Record<string, string>;
}) {
  const [dids, setDids] = useState<Did[]>([]);
  const [country, setCountry] = useState("US");
  const [mode, setMode] = useState<(typeof MODES)[number][0]>("city");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const queryLabel = mode === "number" ? copy.numbersQueryNumber || "Number" : mode === "prefix" ? copy.numbersQueryPrefix || "Starts with" : copy.numbersQuerySuffix || "Ends with";

  async function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const chosenCountry = String(data.get("country") || "US");
    const chosenMode = String(data.get("mode") || "city");
    const params = new URLSearchParams({
      country: chosenCountry,
      region: String(data.get("region") || ""),
      ratecenter: String(data.get("ratecenter") || ""),
      mode: chosenMode,
      query: String(data.get("query") || ""),
    });
    setCountry(chosenCountry);
    setPending(true);
    const response = await fetch(`/api/numbers/search?${params}`);
    const payload = (await response.json()) as { dids?: Did[]; message?: string };
    setDids(payload.dids || []);
    setMessage(payload.message || (payload.dids?.length ? "" : copy.numbersEmpty));
    setPending(false);
  }

  return (
    <div className="contact-form">
      {live ? (
        <form onSubmit={onSearch}>
          <label>{copy.numbersModeLabel || "Search by"}
            <select name="mode" value={mode} onChange={(event) => { setMode(event.target.value as (typeof MODES)[number][0]); setDids([]); setMessage(""); }}>
              {MODES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <div className="form-grid">
            <PlaceSelects
              countryLabel={copy.numbersCountryLabel}
              regionLabel={copy.numbersStateLabel}
              cityLabel={copy.numbersRateLabel}
              regionName="region"
              cityName="ratecenter"
              includeCity={mode === "city"}
            />
            {mode === "city" ? null : <label>{queryLabel} <input name="query" inputMode="numeric" autoComplete="off" required placeholder={mode === "number" ? "7135550100" : "713"} /></label>}
          </div>
          <button className="btn btn-primary" type="submit" disabled={pending}>{copy.numbersSearchLabel}</button>
        </form>
      ) : <p>{copy.numbersLiveOff}</p>}
      {message ? <p className="form-feedback">{message}</p> : null}
      {dids.map((item) => (
        <form key={item.did} action={saveNumber} className="feature-card">
          <input type="hidden" name="did" value={item.did} />
          <input type="hidden" name="country" value={country} />
          <input type="hidden" name="region" value={item.state || ""} />
          <input type="hidden" name="ratecenter" value={item.ratecenter} />
          <strong>{item.did}</strong>
          <p>{[item.ratecenter, item.state, item.monthly ? `$${item.monthly}/mo` : ""].filter(Boolean).join(" · ")}</p>
          <button className="btn btn-secondary" type="submit">{automatic ? copy.numbersBuy || "Buy this number" : copy.numbersRequest}</button>
        </form>
      ))}
    </div>
  );
}
