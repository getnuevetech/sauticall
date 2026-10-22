import { DocumentEditor } from "@/components/admin/Editors";
import { readDoc } from "@/lib/db";

export default function FlagsPage() {
  return (
    <>
      <span className="eyebrow">SWITCHES</span>
      <h2>Enable or disable actions</h2>
      <p>Turn a switch on or off. The switch name is chosen from the list the site already understands, so a mistyped name cannot turn the wrong thing off.</p>
      <DocumentEditor docKey="flags" initial={readDoc("flags")} />
    </>
  );
}
