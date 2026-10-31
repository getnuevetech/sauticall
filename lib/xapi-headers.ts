export function xapiWriteHeaders(extra: Record<string, string> = {}) {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "OData-Version": "4.0",
    Prefer: "return=representation",
  };
  for (const [key, value] of Object.entries(extra)) {
    if (/^content-type$/i.test(key) && !/^application\/json\b/i.test(value)) continue;
    headers[key] = value;
  }
  return headers;
}
