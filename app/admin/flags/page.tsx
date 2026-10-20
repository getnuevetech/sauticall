import { DocumentEditor } from "@/components/admin/Editors";
import { readDoc } from "@/lib/db";

export default function FlagsPage() {
  return (
    <>
      <span className="eyebrow">SWITCHES</span>
      <h2>Enable or disable actions</h2>
      <p>Turn registration, password sign-in, multi-factor authentication, checkout, number requests, porting, and the marketing demos on or off. Add another switch by using Add item; code that checks that key will follow it.</p>
      <DocumentEditor docKey="flags" initial={readDoc("flags")} />
    </>
  );
}
