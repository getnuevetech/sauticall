import { savePort } from "@/app/account/actions";

export function PortForm({ labels }: { labels: Record<string, string> }) {
  return (
    <form className="contact-form" action={savePort}>
      <div className="form-grid">
        <label>{labels.number} <input name="numbers" required placeholder="7135550100" /></label>
        <label>{labels.country}
          <select name="country" defaultValue="US"><option value="US">United States</option><option value="CA">Canada</option></select>
        </label>
      </div>
      <div className="form-grid">
        <label>{labels.first} <input name="first_name" required /></label>
        <label>{labels.last} <input name="last_name" required /></label>
      </div>
      <label>{labels.business} <input name="statement_name" /></label>
      <label>{labels.address} <input name="address1" required /></label>
      <div className="form-grid">
        <label>{labels.city} <input name="city" required /></label>
        <label>{labels.state} <input name="state" required maxLength={2} /></label>
      </div>
      <div className="form-grid">
        <label>{labels.zip} <input name="zip_code" required /></label>
        <label>{labels.carrier} <input name="provider_name" required /></label>
      </div>
      <div className="form-grid">
        <label>{labels.account} <input name="provider_account" required /></label>
        <label>{labels.pin} <input name="pin" /></label>
      </div>
      <button className="btn btn-primary" type="submit">{labels.submit}</button>
    </form>
  );
}
