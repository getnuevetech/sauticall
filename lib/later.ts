import { after } from "next/server";

export function finishAfterResponse(work: () => Promise<unknown>) {
  const run = () => work().catch((error) => {
    console.error("[sauticall] background", error instanceof Error ? error.message : error);
  });
  try {
    after(run);
  } catch {
    void run();
  }
}
