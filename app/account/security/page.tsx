import { AuthForm } from "@/components/account/AuthForm";
import { AuthenticatorGuide } from "@/components/account/AuthenticatorGuide";
import { SettingsHome } from "@/components/account/SettingsHome";
import { clearOwnMfa, enrollMfa } from "../actions";
import { authenticatorQr, authenticatorUri } from "@/lib/authenticator";
import { currentUser } from "@/lib/auth";
import { accountNeedsMfa } from "@/lib/mfa";
import { DEPARTMENT_NAME_RULES, shownAccountName } from "@/lib/pbx-user";
import { extensionCapacity, paidPlan } from "@/lib/pbx";
import { extensionSetup } from "@/lib/account-display";
import { customerMessage } from "@/lib/customer-message";
import { getDb } from "@/lib/db";
import { formatAddress, getEmergency } from "@/lib/e911";
import { placesConfigured } from "@/lib/google-places";
import { redirect } from "next/navigation";
import crypto from "crypto";
import { base32Encode } from "@/lib/auth";

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ tab?: string; saved?: string; error?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/account/login");
  if (user.role !== "customer") redirect("/admin");
  if (accountNeedsMfa(user) && user.mfa_secret && user.mfa_pending) redirect("/account/login?step=code");
  const params = await searchParams;
  const required = accountNeedsMfa(user);
  const secret = base32Encode(crypto.randomBytes(20));
  const uri = authenticatorUri(user.email, secret);
  const qr = await authenticatorQr(uri);
  const plan = paidPlan(user.id);
  const hours = getDb().prepare("SELECT name FROM pbx_departments WHERE user_id = ?").get(user.id) as { name: string } | undefined;
  const profile = getDb().prepare("SELECT business_name FROM users WHERE id = ?").get(user.id) as { business_name: string } | undefined;
  const rows = getDb().prepare("SELECT id, number, former_number, first_name, last_name, email, status FROM pbx_extensions WHERE user_id = ? ORDER BY id").all(user.id) as { id: number; number: string; former_number: string; first_name: string; last_name: string; email: string; status: string }[];
  const active = rows.filter((row) => row.status !== "removed");
  const address = getEmergency(user.id);
  const notice = params.error
    ? customerMessage(params.error, "That change could not be saved.")
    : params.saved === "name"
      ? "Name saved."
      : params.saved === "department"
        ? "Company name saved."
        : params.saved === "address"
          ? "Address saved. It is sent to the VoIP.ms client for this account."
          : "";
  return (
    <SettingsHome
      initialTab={params.tab || (required && !user.mfa_secret ? "security" : "overview")}
      name={user.name}
      email={user.email}
      company={shownAccountName(hours?.name || "", profile?.business_name || "", user.name)}
      rules={DEPARTMENT_NAME_RULES}
      hasPlan={Boolean(plan)}
      seats={plan ? extensionCapacity(plan) : 0}
      used={active.length}
      people={rows.map((row) => ({
        id: row.id,
        name: `${row.first_name} ${row.last_name}`.trim(),
        email: row.email,
        number: row.status === "removed" && row.former_number ? row.former_number : row.number,
        status: extensionSetup(row.status).label,
      }))}
      mfaOn={Boolean(user.mfa_secret)}
      mfaRequired={required}
      notice={notice}
      addressLine={address ? formatAddress(address) : ""}
      address={{
        full_name: address?.full_name || user.name,
        street_number: address?.street_number || "",
        street_name: address?.street_name || "",
        address_type: address?.address_type || "",
        address_number: address?.address_number || "",
        city: address?.city || "",
        state: address?.state || "",
        country: address?.country || "US",
        zip: address?.zip || "",
      }}
      lookup={placesConfigured()}
    >
      {!user.mfa_secret ? (
        <div>
          <h2>Security</h2>
          <p>{required ? "This account needs an authenticator. An app password stays hidden until you enter a code." : "You can add an authenticator now. Once it is on, revealing an app password asks for a code."}</p>
          <AuthenticatorGuide mode="setup" />
          <div className="auth-qr" dangerouslySetInnerHTML={{ __html: qr }} />
          <p>Setup key, if the app asks you to type it.</p>
          <p><strong>{secret}</strong></p>
          <AuthForm action={enrollMfa} submit="Turn on authenticator" fields={[{ name: "code", label: "Code from the app", placeholder: "123456" }]} extra={<input type="hidden" name="secret" value={secret} />} />
        </div>
      ) : (
        <div>
          <h2>Security</h2>
          <p>An authenticator is saved for this account. Revealing an app password asks for a code from that app.</p>
          <AuthenticatorGuide mode="signin" />
          {!required ? <form action={clearOwnMfa}><button className="ws-btn ghost" type="submit">Remove authenticator</button></form> : <p>An administrator requires an authenticator on this account.</p>}
        </div>
      )}
    </SettingsHome>
  );
}
