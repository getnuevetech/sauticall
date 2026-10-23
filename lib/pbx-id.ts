function readId(body: unknown) {
  if (body && typeof body === "object" && "Id" in body) return Number((body as { Id?: unknown }).Id) || 0;
  return 0;
}

export function idFromPbx(body: unknown, location = "") {
  const direct = readId(body);
  if (direct) return direct;
  const match = /(?:Users|Groups|RingGroups|Queues)\((\d+)\)/i.exec(location);
  return match ? Number(match[1]) : 0;
}
