"use client";

import { useRef, useState } from "react";
import { searchTicketCustomers } from "@/app/admin/desk-actions";

type Match = { id: number; name: string; email: string };

export function CustomerEmailPicker() {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [chosen, setChosen] = useState<Match | null>(null);
  const [settled, setSettled] = useState(false);
  const request = useRef(0);

  async function onChange(value: string) {
    setQuery(value);
    setChosen(null);
    const id = ++request.current;
    if (value.trim().length < 2) {
      setMatches([]);
      setSettled(false);
      return;
    }
    setSettled(false);
    const found = await searchTicketCustomers(value);
    if (id !== request.current) return;
    setMatches(found);
    setSettled(true);
  }

  return (
    <div>
      <label>Customer email
        <input value={query} onChange={(event) => onChange(event.target.value)} placeholder="name@company.com" autoComplete="off" required={!chosen} />
      </label>
      <input type="hidden" name="customer_id" value={chosen?.id || ""} />
      {chosen ? <p>This ticket is for {chosen.name}, {chosen.email}.</p> : null}
      {!chosen && matches.length > 0 ? (
        <ul className="email-picks">
          {matches.map((match) => (
            <li key={match.id}>
              <button type="button" onClick={() => { setChosen(match); setQuery(match.email); setMatches([]); }}>
                {match.name} · {match.email}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {!chosen && settled && matches.length === 0 ? <p>No registered customer has that email.</p> : null}
    </div>
  );
}
