import { CallsVoicemail } from "@/components/account/CallsVoicemail";
import { guardAccount } from "@/lib/guard";
import { flagOn, getDb, readDoc } from "@/lib/db";
import { minuteBalance } from "@/lib/minutes";
import { accountUsage } from "@/lib/account-usage";
import { relativeWhen } from "@/lib/account-display";
import { customerMessage } from "@/lib/customer-message";
import { readGatewaySecret } from "@/lib/payment-keys";

export default async function MinutesPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string; tab?: string }> }) {
  const user = await guardAccount();
  const params = await searchParams;
  const usage = accountUsage(user.id);
  const balance = minuteBalance(user.id);
  const bundles = readDoc<{ name: string; minutes: number; price: number; enabled?: boolean }[]>("minute_bundles").filter((bundle) => bundle.enabled !== false && Number(bundle.minutes) > 0 && Number(bundle.price) > 0);
  const gateways = getDb().prepare("SELECT id, public_label, secret FROM gateways WHERE enabled = 1 ORDER BY priority").all() as { id: number; public_label: string; secret: string }[];
  const ready = gateways.filter((gateway) => readGatewaySecret(gateway.secret).key);
  const calls = getDb().prepare("SELECT uniqueid, destination, seconds, started_at FROM cdr_events WHERE user_id = ? ORDER BY started_at DESC LIMIT 50").all(user.id) as { uniqueid: string; destination: string; seconds: number; started_at: string }[];
  const sync = getDb().prepare("SELECT last_sync FROM voip_subaccounts WHERE user_id = ?").get(user.id) as { last_sync: string } | undefined;
  const people = getDb().prepare("SELECT id, number, former_number, first_name, last_name, status FROM pbx_extensions WHERE user_id = ? AND status != 'removed' ORDER BY number").all(user.id) as { id: number; number: string; former_number: string; first_name: string; last_name: string; status: string }[];
  const notice = params.error
    ? customerMessage(params.error, "Call minutes could not be updated. Please try again, or contact support.")
    : params.saved === "sync"
      ? "Minutes are updating."
      : params.saved
        ? "Minutes updated."
        : "";
  return (
    <CallsVoicemail
      initialTab={params.tab || "minutes"}
      included={usage.included}
      used={usage.usedMinutes}
      remaining={usage.remaining}
      bundleLeft={balance.bundleMinutesLeft}
      syncedLabel={sync?.last_sync ? `Last synced ${relativeWhen(sync.last_sync).toLowerCase()}` : "Minutes have not been synced yet"}
      checkout={flagOn("billing.checkout")}
      bundles={bundles.map((bundle) => ({ name: bundle.name, minutes: Number(bundle.minutes), price: Number(bundle.price) }))}
      gateways={ready.map((gateway) => ({ id: gateway.id, label: gateway.public_label }))}
      calls={calls.map((call) => ({ id: call.uniqueid, destination: call.destination, seconds: call.seconds, startedAt: call.started_at }))}
      mailboxes={people.map((person) => ({ id: person.id, number: person.status === "removed" && person.former_number ? person.former_number : person.number, name: `${person.first_name} ${person.last_name}`.trim() }))}
      notice={notice}
    />
  );
}
