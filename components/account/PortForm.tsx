import { savePort } from "@/app/account/actions";
import { PlaceSelects } from "./PlaceSelects";

export function PortForm({ labels }: { labels: Record<string, string> }) {
  return (
    <form className="contact-form" action={savePort}>
      <label>{labels.number} <input name="numbers" required placeholder="7135550100" /></label>
      <div className="form-grid">
        <label>{labels.first} <input name="first_name" required /></label>
        <label>{labels.last} <input name="last_name" required /></label>
      </div>
      <label>{labels.business} <input name="statement_name" /></label>
      <label>{labels.address} <input name="address1" required /></label>
      <div className="form-grid">
        <PlaceSelects countryLabel={labels.country} regionLabel={labels.state} cityLabel={labels.city} />
        <label>{labels.zip} <input name="zip_code" required /></label>
      </div>
      <div className="form-grid">
        <label>{labels.carrier} <input name="provider_name" required /></label>
        <label>{labels.account} <input name="provider_account" required /></label>
      </div>
      <label>{labels.pin} <input name="pin" /></label>
      <button className="btn btn-primary" type="submit">{labels.submit}</button>
    </form>
  );
}
