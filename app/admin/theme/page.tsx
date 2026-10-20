import { DocumentEditor } from "@/components/admin/Editors";
import { readDoc } from "@/lib/db";

export default function ThemePage() {
  return (
    <>
      <span className="eyebrow">THEME</span>
      <h2>Fonts, logo, and colors</h2>
      <p>Leave the values as they are to keep the approved Clear White design. Set logoUrl to an uploaded image path to replace the drawn mark. Set fontStylesheetUrl to load a font file, then set fontFamily to that family name.</p>
      <DocumentEditor docKey="theme" initial={readDoc("theme")} />
    </>
  );
}
