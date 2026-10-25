"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { saveExtensionPlan } from "@/app/admin/actions";
import type { ExtensionPlan } from "@/lib/extension-numbers";

export function ExtensionPlanForm({ plan }: { plan: ExtensionPlan }) {
  const router = useRouter();
  const [values, setValues] = useState({
    start: String(plan.start),
    ringStart: String(plan.ringStart),
    queueStart: String(plan.queueStart),
    span: String(plan.span),
    groupSpan: String(plan.groupSpan),
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);

  function set(field: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  const start = Number(values.start);
  const span = Number(values.span);
  const ring = Number(values.ringStart);
  const queue = Number(values.queueStart);
  const personEnd = Number.isFinite(start) && Number.isFinite(span) ? start + Math.max(span, 1) - 1 : start;
  const clashes = [
    Number.isFinite(ring) && ring >= start && ring <= personEnd ? `ring groups at ${values.ringStart}` : "",
    Number.isFinite(queue) && queue >= start && queue <= personEnd ? `queues at ${values.queueStart}` : "",
  ].filter(Boolean);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setNotice("");
    const data = new FormData();
    data.set("start", values.start);
    data.set("ring_start", values.ringStart);
    data.set("queue_start", values.queueStart);
    data.set("span", values.span);
    data.set("group_span", values.groupSpan);
    const result = await saveExtensionPlan(data);
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setNotice(result.message);
    router.refresh();
  }

  return (
    <form className="contact-form" autoComplete="off" onSubmit={onSubmit}>
      <h3>Extension numbers</h3>
      <p>The next person is numbered from the first extension. Set that to 500 when 3CX already uses lower numbers such as 122. The lowest number that can be saved is 100. People, ring groups, and queues need three different starting numbers.</p>
      {notice ? <p className="form-feedback">{notice}</p> : null}
      {error ? <p className="form-feedback">{error}</p> : null}
      {clashes.length ? <p className="form-feedback">Person extensions are chosen from {values.start || "the first person number"} upward. Starting {clashes.join(" and ")} can take a number a person would use. Use a ring group and queue number below {values.start}.</p> : null}
      <div className="form-grid">
        <label>First extension for a person <input name="start" type="number" min={100} max={90000} required value={values.start} onChange={(event) => set("start", event.target.value)} /></label>
        <label>First ring group <input name="ring_start" type="number" min={100} max={90000} required value={values.ringStart} onChange={(event) => set("ringStart", event.target.value)} /></label>
        <label>First call queue <input name="queue_start" type="number" min={100} max={90000} required value={values.queueStart} onChange={(event) => set("queueStart", event.target.value)} /></label>
      </div>
      <details className="admin-more">
        <summary>If those extension numbers are already taken</summary>
        <div className="admin-more-body">
          <p>These count how many extension numbers SautiCall may try after the plan’s reserved numbers are full. They are not sent to 3CX. 3CX is read 100 records at a time, and a request for 500 records is rejected.</p>
          <label>Extension numbers to try for a person after that customer’s reserved numbers are full <input name="span" type="number" min={1} max={50000} required value={values.span} onChange={(event) => set("span", event.target.value)} /></label>
          <label>Extension numbers to try for a ring group or queue <input name="group_span" type="number" min={1} max={50000} required value={values.groupSpan} onChange={(event) => set("groupSpan", event.target.value)} /></label>
        </div>
      </details>
      <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? "Saving" : "Save extension numbers"}</button>
    </form>
  );
}
