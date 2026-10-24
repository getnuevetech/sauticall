const EXTENSION_START = 2000;
const EXTENSION_BLOCK = 10;
const EXTENSION_SPAN = 5000;

export function extensionRange(userId: number) {
  const from = EXTENSION_START + (Math.max(userId, 1) - 1) * EXTENSION_BLOCK;
  return { from, to: from + EXTENSION_BLOCK - 1 };
}

export function chooseExtension(userId: number, taken: string[], customerIds: number[]) {
  const used = new Set(taken);
  const reserved = new Set<string>();
  for (const id of customerIds) {
    if (id === userId) continue;
    const range = extensionRange(id);
    for (let number = range.from; number <= range.to; number += 1) reserved.add(String(number));
  }
  const own = extensionRange(userId);
  for (let number = own.from; number <= own.to; number += 1) {
    const value = String(number);
    if (!used.has(value)) return value;
  }
  for (let number = EXTENSION_START; number < EXTENSION_START + EXTENSION_SPAN; number += 1) {
    const value = String(number);
    if (used.has(value) || reserved.has(value)) continue;
    return value;
  }
  return "";
}
