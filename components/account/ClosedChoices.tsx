import { AFTER_ACTIONS, GREETINGS, OFFICE_TIMES, TONES, greetingValue, officeTimeLabel, readOfficeHours, type Accent } from "@/lib/ai-choices";

export function ChoiceSelect({ label, name, value, options, required = false }: { label: string; name: string; value: string; options: { value: string; label: string }[]; required?: boolean }) {
  const known = options.some((option) => option.value === value);
  const choices = known || !value ? options : [{ value, label: value }, ...options];
  return (
    <label>{label}
      <select name={name} defaultValue={known ? value : value || options[0]?.value || ""} required={required}>
        {choices.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

export function AccentSelect({ accents, value }: { accents: Accent[]; value: string }) {
  if (accents.length === 0) return <p>No accents are turned on for this plan. An administrator chooses which accents each plan can use.</p>;
  const regions = [...new Set(accents.map((accent) => accent.region))];
  const selected = accents.some((accent) => accent.id === value) ? value : accents[0].id;
  return (
    <label>Accent
      <select name="voice" defaultValue={selected} required>
        {regions.map((region) => (
          <optgroup key={region} label={region}>
            {accents.filter((accent) => accent.region === region).map((accent) => <option key={accent.id} value={accent.id}>{accent.label}</option>)}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

export function GreetingSelect({ value }: { value: string }) {
  const selected = greetingValue(value);
  return (
    <label>Greeting
      <select name="greeting" defaultValue={selected || (value ? value : GREETINGS[0].id)} required>
        {value && !selected ? <option value={value}>{value}</option> : null}
        {GREETINGS.map((greeting) => <option key={greeting.id} value={greeting.id}>{greeting.label}</option>)}
      </select>
    </label>
  );
}

export function HoursFields({ stored, targets }: { stored: string; targets: { value: string; label: string }[] }) {
  const hours = readOfficeHours(stored);
  return (
    <>
      <ChoiceSelect label="Office opens" name="open_time" value={hours.open} options={OFFICE_TIMES.map((time) => ({ value: time, label: officeTimeLabel(time) }))} required />
      <ChoiceSelect label="Office closes" name="close_time" value={hours.close} options={OFFICE_TIMES.map((time) => ({ value: time, label: officeTimeLabel(time) }))} required />
      <ChoiceSelect label="After hours" name="after_action" value={hours.action} options={AFTER_ACTIONS.map((action) => ({ value: action.id, label: action.label }))} required />
      <ChoiceSelect label="After-hours extension" name="after_target" value={hours.target} options={[{ value: "", label: "No extension" }, ...targets]} />
    </>
  );
}

export function TransferFields({ targets, selected }: { targets: { value: string; label: string }[]; selected: string[] }) {
  const chosen = new Set(selected);
  if (targets.length === 0) return <p>No extension or ring group is on this account yet. Add a person under Phone, then choose who this receptionist may transfer to.</p>;
  return (
    <fieldset>
      <legend>Approved transfers</legend>
      {targets.map((target) => (
        <label key={target.value}>
          <input type="checkbox" name="transfers" value={target.value} defaultChecked={chosen.has(target.value)} /> {target.label}
        </label>
      ))}
    </fieldset>
  );
}

export function ToneSelect({ value }: { value: string }) {
  return <ChoiceSelect label="Tone" name="tone" value={value} options={TONES.map((tone) => ({ value: tone.id, label: tone.label }))} required />;
}
