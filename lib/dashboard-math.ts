const CHICAGO = "America/Chicago";

export function chicagoDay(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: CHICAGO, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function recentDays(count: number, now = new Date()) {
  const days: string[] = [];
  const cursor = new Date(now);
  cursor.setUTCHours(18, 0, 0, 0);
  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(cursor.getTime() - index * 24 * 60 * 60 * 1000);
    const day = chicagoDay(date.toISOString());
    if (days[days.length - 1] !== day) days.push(day);
  }
  return days.slice(-count);
}

export function shortDay(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date) return day;
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(new Date(Date.UTC(year, month - 1, date, 12)));
}

export function tally<T>(rows: T[], keyOf: (row: T) => string) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = keyOf(row);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

export function seriesFrom(days: string[], rows: { at: string; amount?: number }[], sumAmount = false) {
  const totals = new Map(days.map((day) => [day, 0]));
  for (const row of rows) {
    const day = chicagoDay(row.at);
    if (!totals.has(day)) continue;
    totals.set(day, (totals.get(day) || 0) + (sumAmount ? row.amount || 0 : 1));
  }
  return days.map((day) => ({ label: shortDay(day), value: totals.get(day) || 0 }));
}

export function windowSum(points: { value: number }[], size: number) {
  return points.slice(-size).reduce((sum, point) => sum + point.value, 0);
}

export function runningTotal(points: { label: string; value: number }[]) {
  let total = 0;
  return points.map((point) => ({ label: point.label, value: (total += point.value) }));
}

export function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
}

export function donutArcs(values: number[]) {
  const total = values.reduce((sum, value) => sum + Math.max(0, value), 0);
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  let cursor = 0;
  const arcs = values.map((value) => {
    const portion = total === 0 ? 0 : Math.max(0, value) / total;
    const length = portion * circumference;
    const arc = { length, gap: circumference - length, offset: circumference - cursor };
    cursor += length;
    return arc;
  });
  return { total, radius, circumference, arcs };
}
