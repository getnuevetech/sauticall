function readId(body: unknown) {
  if (body && typeof body === "object" && "Id" in body) return Number((body as { Id?: unknown }).Id) || 0;
  return 0;
}

export function idFromPbx(body: unknown, location = "") {
  const direct = readId(body);
  if (direct) return direct;
  const match = /(?:Users|Groups|RingGroups|Queues|Trunks|OutboundRules|InboundRules)\((\d+)\)/i.exec(location);
  return match ? Number(match[1]) : 0;
}

export function firstListedId(body: unknown) {
  const direct = idFromPbx(body, "");
  if (direct) return direct;
  if (body && typeof body === "object" && Array.isArray((body as { value?: unknown }).value)) {
    return idFromPbx((body as { value: unknown[] }).value[0], "");
  }
  return 0;
}
