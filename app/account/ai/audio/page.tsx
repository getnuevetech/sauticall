import Link from "next/link";
import { generateAudioForm, keepAudioForm, uploadAudioForm } from "./actions";
import { guardAccount } from "@/lib/guard";
import { listClips, listVoices } from "@/lib/ai-audio-store";
import { paidPlan } from "@/lib/pbx";
import { planAllows } from "@/lib/plan-features";

function sourceLabel(source: string) {
  if (source === "preview") return "Preview tone. This is not a spoken voice.";
  if (source === "engine") return "Spoken by the text-to-voice engine on this account.";
  return "Uploaded recording.";
}

export default async function AccountAudioPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; id?: string }> }) {
  const user = await guardAccount();
  const query = await searchParams;
  if (!planAllows(paidPlan(user.id), "ai_voice")) {
    return (
      <div className="workspace-page">
        <header className="workspace-page-head">
          <h1>Audio</h1>
          <p>Text to voice is not included on this plan. <Link className="text-link" href="/account/ai">Back to AI</Link></p>
        </header>
      </div>
    );
  }
  const voices = listVoices().filter((voice) => voice.enabled);
  const clips = listClips(user.id);
  const notice = query.saved === "preview" ? "Preview tone stored. No call was placed."
    : query.saved === "engine" ? "Spoken audio stored. No call was placed."
      : query.saved === "reused" ? "Using the saved audio. No call was placed."
        : query.saved === "upload" ? "Recording stored. No call was placed."
          : query.saved === "ready" ? "This version is kept. No call was placed."
            : "";
  return (
    <div className="workspace-page">
      <header className="workspace-page-head">
        <h1>Audio</h1>
        <p>Store a message or a preview. SautiCall keeps the file on this account. Nothing here places a call. <Link className="text-link" href="/account/ai">Back to AI services</Link></p>
      </header>
      {notice ? <p className="form-feedback">{notice}</p> : null}
      {query.error ? <p className="form-feedback">{query.error}</p> : null}
      <form className="contact-form" action={generateAudioForm}>
        <h3>Generate</h3>
        <p>No charge is calculated on this screen. Generation only stores audio.</p>
        <label>Name <input name="title" required /></label>
        <label>Words <textarea name="script" rows={4} required /></label>
        <label>Voice
          <select name="voice_id" required defaultValue="">
            <option value="" disabled>Choose a voice</option>
            {voices.map((voice) => <option key={voice.id} value={voice.id}>{voice.name}</option>)}
          </select>
        </label>
        {voices.length === 0 ? <p>An administrator has not turned on a voice yet.</p> : <button className="ws-btn primary" type="submit">Store audio</button>}
      </form>
      <form className="contact-form" action={uploadAudioForm}>
        <h3>Upload</h3>
        <label>Name <input name="title" required /></label>
        <label>WAV or MP3 <input name="file" type="file" accept="audio/wav,audio/mpeg,.wav,.mp3" required /></label>
        <button className="ws-btn ghost" type="submit">Upload recording</button>
      </form>
      <div className="ai-services">
        {clips.map((clip) => (
          <article className="contact-form" key={clip.id}>
            <h3>{clip.title}</h3>
            <p>{sourceLabel(clip.source)} {Math.max(1, Math.round(clip.durationMs / 1000))} seconds. {clip.status === "ready" ? "Kept for later." : "Draft."}</p>
            <audio controls preload="none" src={`/api/ai/audio/${clip.id}`} />
            {clip.status === "ready" ? null : (
              <form action={keepAudioForm}>
                <input type="hidden" name="id" value={clip.id} />
                <button className="ws-btn ghost" type="submit">Keep this version</button>
              </form>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
