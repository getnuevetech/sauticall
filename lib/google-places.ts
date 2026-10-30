import { getConnection, saveConnection } from "./carriers";
import { parseGoogleAddress, type GoogleComponent } from "./google-address";

const AUTOCOMPLETE = "https://places.googleapis.com/v1/places:autocomplete";

function placesSecret() {
  const env = String(process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "").trim();
  if (env) return env;
  const saved = getConnection("google");
  return saved.enabled && saved.secret ? saved.secret : "";
}

export function placesConfigured() {
  return Boolean(placesSecret());
}

export function savePlacesKey(enabled: boolean, secret: string) {
  const existing = getConnection("google");
  const next = secret.trim() || existing.secret;
  saveConnection("google", enabled && Boolean(next), {}, secret.trim() ? secret.trim() : null);
}

function componentsFrom(body: unknown) {
  if (!body || typeof body !== "object") return [];
  const record = body as { addressComponents?: unknown; address_components?: unknown };
  const list = Array.isArray(record.addressComponents) ? record.addressComponents : Array.isArray(record.address_components) ? record.address_components : [];
  return list.filter((item) => item && typeof item === "object") as GoogleComponent[];
}

export async function suggestAddresses(input: string) {
  const key = placesSecret();
  const query = input.trim();
  if (!key) return { ok: false as const, suggestions: [] as { id: string; label: string }[], message: "Google address lookup is not configured. Enter the address below." };
  if (query.length < 3) return { ok: false as const, suggestions: [], message: "Enter more of the address." };
  const response = await fetch(AUTOCOMPLETE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text",
    },
    body: JSON.stringify({ input: query, includedRegionCodes: ["us", "ca"] }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return { ok: false as const, suggestions: [], message: "Google address lookup is not available right now." };
  const body = await response.json() as { suggestions?: { placePrediction?: { placeId?: string; text?: { text?: string } } }[] };
  const suggestions = (body.suggestions || []).flatMap((item) => {
    const id = String(item.placePrediction?.placeId || "");
    const label = String(item.placePrediction?.text?.text || "");
    return id && label ? [{ id, label }] : [];
  }).slice(0, 5);
  return { ok: true as const, suggestions, message: suggestions.length ? "" : "No matching address was found." };
}

export async function readGoogleAddress(placeId: string) {
  const key = placesSecret();
  if (!key) return { ok: false as const, message: "Google address lookup is not configured. Enter the address below." };
  if (!/^[A-Za-z0-9_-]{4,200}$/.test(placeId)) return { ok: false as const, message: "That address could not be opened." };
  const response = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    headers: {
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "addressComponents",
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return { ok: false as const, message: "Google did not return that address." };
  const parsed = parseGoogleAddress(componentsFrom(await response.json()));
  return parsed.ok ? { ok: true as const, address: parsed.address, message: "" } : { ok: false as const, message: parsed.message };
}
