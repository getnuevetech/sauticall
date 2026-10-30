import { AiSectionNav } from "@/components/admin/AiSectionNav";
import { requirePermission } from "@/lib/access";
import { audioPolicy, listRecentClips, listVoices } from "@/lib/ai-audio-store";
import { listAiEngines } from "@/lib/ai-store";
import { removeVoiceForm, saveAudioPolicyForm, saveVoiceForm } from "./actions";

function sourceLabel(source: string) {
  if (source === "preview") return "Preview tone";
  if (source === "engine") return "Text to voice";
  return "Upload";
}

export default async function AiAudioAdminPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  await requirePermission("settings.ai");
  const query = await searchParams;
  const policy = audioPolicy();
  const voices = listVoices();
  const engines = listAiEngines().filter((item) => item.kind === "tts" && item.enabled);
  const clips = listRecentClips();
  const notice = query.saved === "policy" ? "Audio limits saved. No call was placed."
    : query.saved === "voice" ? "Voice saved. No call was placed."
      : query.saved === "removed" ? "Voice removed."
        : "";
  return (
    <div className="ops ops-single">
      <div>
        <p className="ops-kicker">AI System / Audio</p>
        <h1>Audio</h1>
        <AiSectionNav current="audio" />
        <p>SautiCall stores the file. A voice can use the assigned text-to-voice engine, or the preview tone when that engine is not ready. Playing a file here does not place a call.</p>
        {notice ? <p className="form-feedback">{notice}</p> : null}
        {query.error ? <p className="ops-alert">{query.error}</p> : null}
        <form action={saveAudioPolicyForm} className="ops-card ops-stack">
          <h2>Limits</h2>
          <label>Maximum length in seconds <input name="max_seconds" type="number" min={1} max={180} defaultValue={policy.maxSeconds} required /></label>
          <label>Maximum size in MB <input name="max_mb" type="number" min={1} max={5} step="0.1" defaultValue={policy.maxBytes / 1_000_000} required /></label>
          <label>Keep unfinished audio for days <input name="retention_days" type="number" min={1} max={3650} defaultValue={policy.retentionDays} required /></label>
          <label className="audio-check"><input type="checkbox" name="preview" defaultChecked={policy.previewEnabled} /> Allow the preview tone when a voice has no engine</label>
          <button className="btn btn-primary" type="submit">Save limits</button>
        </form>
        <form action={saveVoiceForm} className="ops-card ops-stack">
          <h2>Add a voice</h2>
          <label>Name <input name="name" required /></label>
          <label>Voice key <input name="voice_key" required placeholder="preview" /></label>
          <label>Text-to-voice engine
            <select name="engine_id" defaultValue="">
              <option value="">Preview tone</option>
              {engines.map((engine) => <option key={engine.id} value={engine.id}>{engine.name}</option>)}
            </select>
          </label>
          <label className="audio-check"><input type="checkbox" name="rights" /> We have the right to use this voice</label>
          <label className="audio-check"><input type="checkbox" name="enabled" /> Turn on for customers</label>
          <button className="btn btn-primary" type="submit">Save voice</button>
        </form>
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead><tr><th>Voice</th><th>Key</th><th>Engine</th><th></th></tr></thead>
            <tbody>
              {voices.map((voice) => (
                <tr key={voice.id}>
                  <td><strong>{voice.name}</strong><small>{voice.enabled ? "On" : "Off"}</small></td>
                  <td>{voice.voiceKey}</td>
                  <td>{voice.engineId ? engines.find((engine) => engine.id === voice.engineId)?.name || "Saved engine" : "Preview tone"}</td>
                  <td>
                    <form action={removeVoiceForm}><input type="hidden" name="id" value={voice.id} /><button className="btn btn-secondary" type="submit">Remove</button></form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="ops-card">
          <h2>Stored audio</h2>
          {clips.length === 0 ? <p>No audio is stored yet.</p> : clips.map((clip) => (
            <article key={clip.id}>
              <strong>{clip.title}</strong>
              <p>{sourceLabel(clip.source)} · {Math.max(1, Math.round(clip.durationMs / 1000))} seconds · {clip.status === "ready" ? "Kept" : "Draft"}</p>
              <audio controls preload="none" src={`/api/ai/audio/${clip.id}`} />
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
