export function nextFreeNumber(used: string[], start: number, span = 5000) {
  const taken = new Set(used);
  const width = Math.max(span, 1);
  for (let number = start; number < start + width; number += 1) {
    if (!taken.has(String(number))) return String(number);
  }
  return "";
}
