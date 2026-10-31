"use client";

import { useEffect, useState } from "react";
import { regionsFor } from "@/lib/places";

export function PlaceSelects({
  countryLabel,
  regionLabel,
  cityLabel,
  countryDefault = "US",
  regionDefault = "",
  cityDefault = "",
  regionName = "state",
  cityName = "city",
  countryName = "country",
  includeCity = true,
}: {
  countryLabel: string;
  regionLabel: string;
  cityLabel: string;
  countryDefault?: string;
  regionDefault?: string;
  cityDefault?: string;
  regionName?: string;
  cityName?: string;
  countryName?: string;
  includeCity?: boolean;
}) {
  const [country, setCountry] = useState(countryDefault === "CA" ? "CA" : "US");
  const [region, setRegion] = useState(regionDefault.toUpperCase());
  const [city, setCity] = useState(cityDefault);
  const [places, setPlaces] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState(false);

  useEffect(() => {
    if (!includeCity || !region) {
      setPlaces([]);
      setNote("");
      setNoteError(false);
      return;
    }
    let cancel = false;
    setNote("");
    setNoteError(false);
    fetch(`/api/numbers/places?country=${country}&region=${region}`)
      .then((response) => response.json())
      .then((payload: { places?: string[]; message?: string }) => {
        if (cancel) return;
        const list = payload.places || [];
        setPlaces(list);
        setCity((current) => list.find((item) => item.toUpperCase() === current.toUpperCase()) || "");
        setNote(list.length ? "" : payload.message || "No cities were returned for that state.");
        setNoteError(list.length === 0);
      })
      .catch(() => {
        if (!cancel) {
          setPlaces([]);
          setNote("The city list could not be loaded.");
          setNoteError(true);
        }
      });
    return () => {
      cancel = true;
    };
  }, [country, region, includeCity]);

  const regions = regionsFor(country);
  return (
    <>
      <label>{countryLabel}
        <span className="place-country">
          <span aria-hidden="true">{country === "CA" ? "🇨🇦" : "🇺🇸"}</span>
          <select name={countryName} value={country} onChange={(event) => { setCountry(event.target.value); setRegion(""); setCity(""); }}>
            <option value="US">United States</option>
            <option value="CA">Canada</option>
          </select>
        </span>
      </label>
      <label>{regionLabel}
        <select name={regionName} value={region} required onChange={(event) => { setRegion(event.target.value); setCity(""); }}>
          <option value="">Choose a state</option>
          {regions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      {includeCity ? <label>{cityLabel}
        <select name={cityName} value={city} required onChange={(event) => setCity(event.target.value)}>
          <option value="">{region ? "Choose a city" : "Choose a state first"}</option>
          {places.map((place) => <option key={place} value={place}>{place}</option>)}
        </select>
      </label> : null}
      {note ? <p className={noteError ? "form-feedback form-error" : "form-feedback"} role={noteError ? "alert" : "status"} style={{ gridColumn: "1 / -1" }}>{note}</p> : null}
    </>
  );
}
