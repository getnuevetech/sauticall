export const TRUNK_AUTO_LIMIT = 3;

export const TRUNK_AUTO_STOPPED = "Automatic tries stopped at 3 of 3. An administrator can retry, or create the trunk in 3CX and save its id here.";

export function trunkMayAutoTry(attempts: number) {
  return attempts < TRUNK_AUTO_LIMIT;
}

export function automaticStopNote(technical: string) {
  const extra = technical.trim();
  if (!extra) return TRUNK_AUTO_STOPPED;
  if (extra.startsWith(TRUNK_AUTO_STOPPED)) return extra.slice(0, 2000);
  return `${TRUNK_AUTO_STOPPED} ${extra}`.slice(0, 2000);
}

export function trunkDigits(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

export function trunkSubjectMatchesLine(subject: string, did: string) {
  const left = trunkDigits(subject);
  const right = trunkDigits(did);
  if (left.length < 4 || right.length < 4) return false;
  return left === right;
}

export function customerTrunkStatus(input: { status: string; trunkId?: number; attempts?: number; routes?: boolean }) {
  const trunkId = input.trunkId || 0;
  const attempts = input.attempts || 0;
  if (input.status === "trunk_live" || input.status === "trunk_done") return "Connected for calls";
  if (trunkId > 0 && input.routes) return "Trunk added. Connecting this number for calls.";
  if (trunkId > 0) return "Trunk added. Routing still needs the team.";
  if (input.status === "trunk_waiting" && attempts >= TRUNK_AUTO_LIMIT) return "The trunk could not be added after 3 tries. Waiting for the team.";
  if (input.status === "trunk_waiting" && attempts > 0) return `Adding the trunk. Try ${attempts} of 3.`;
  if (input.status === "trunk_waiting") return "Bought. Connecting this number for calls still needs the team.";
  if (input.status === "not_on_carrier") return "Not on the phone company";
  if (input.status === "ordered") return "Bought. Connecting this number for calls.";
  return "In progress";
}

export function trunkAttemptLabel(input: { status: string; trunkId?: number; attempts?: number }) {
  const trunkId = input.trunkId || 0;
  const attempts = input.attempts || 0;
  if (input.status === "trunk_live" || input.status === "trunk_done") return "Finished";
  if (trunkId > 0) return `Trunk ${trunkId} saved`;
  if (attempts >= TRUNK_AUTO_LIMIT) return "3 of 3 · waiting for admin";
  if (attempts > 0) return `${attempts} of 3`;
  return "Not started";
}

export function customerConnectionNote(lines: { status: string; trunkId: number; attempts: number; routes: boolean }[]) {
  const active = lines.filter((line) => line.status !== "not_on_carrier");
  if (!active.length || active.some((line) => line.status === "trunk_live" || line.status === "trunk_done")) return "";
  const ranked = [...active].sort((left, right) => {
    const score = (line: { trunkId: number; routes: boolean; attempts: number }) => (line.trunkId > 0 ? 100 : 0) + (line.routes ? 10 : 0) + line.attempts;
    return score(right) - score(left);
  });
  return customerTrunkStatus(ranked[0]);
}
