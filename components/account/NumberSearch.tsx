"use client";

import { FormEvent, useState } from "react";
import { saveNumber } from "@/app/account/actions";

type Did = { did: string; ratecenter: string; state: string; monthly: string };

export function NumberSearch({
  live,
  copy,
}: {
  live: boolean;
  copy: Record<string, string>;
}) {
  const [dids, setDids] = useState<Did[]>([]);
  const [country, setCountry] = useState("US");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const params = new URLSearchParams({
      country: String(data.get("country") || "US"),
      region: String(data.get("region") || ""),
      ratecenter: String(data.get("ratecenter") || ""),
    });
    setCountry(String(data.get("country") || "US"));
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
          <div className="form-grid">
            <label>{copy.numbersCountryLabel}
              <select name="country" defaultValue="US"><option value="US">United States</option><option value="CA">Canada</option></select>
            </label>
            <label>{copy.numbersStateLabel} <input name="region" required maxLength={2} placeholder="TX" /></label>
          </div>
          <label>{copy.numbersRateLabel} <input name="ratecenter" placeholder={copy.numbersRatePlaceholder} /></label>
          <button className="btn btn-primary" type="submit" disabled={pending}>{copy.numbersSearchLabel}</button>
        </form>
      ) : <p>{copy.numbersLiveOff}</p>}
      {message ? <p className="form-feedback">{message}</p> : null}
      {dids.map((item) => (
        <form key={item.did} action={saveNumber} className="feature-card">
          <input type="hidden" name="did" value={item.did} />
          <input type="hidden" name="country" value={country} />
          <input type="hidden" name="region" value={item.state} />
          <input type="hidden" name="ratecenter" value={item.ratecenter} />
          <strong>{item.did}</strong>
          <p>{[item.ratecenter, item.state, item.monthly ? `$${item.monthly}/mo` : ""].filter(Boolean).join(" · ")}</p>
          <button className="btn btn-secondary" type="submit">{copy.numbersRequest}</button>
        </form>
      ))}
    </div>
  );
}
