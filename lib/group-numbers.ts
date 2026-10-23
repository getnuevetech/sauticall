export function nextFreeNumber(used: string[], start: number) {
  const taken = new Set(used);
  for (let number = start; number < start + 5000; number += 1) {
    if (!taken.has(String(number))) return String(number);
  }
  return "";
}
