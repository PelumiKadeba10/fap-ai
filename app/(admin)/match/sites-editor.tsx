"use client";
import { useState, useTransition } from "react";
import type { Direction, Site, SiteKind } from "@/lib/types";
import { DIRECTIONS, historyForecast, siteNeed } from "@/lib/match";
import { removeSite, saveSite } from "../actions";
import { cardTable } from "../ui";

const KINDS: SiteKind[] = ["School", "Community", "Care home", "Shelter", "Other"];

type Draft = { name: string; kind: SiteKind; people: number | null; km: number; direction: Direction; contact_phone: string | null };
const toDraft = (s: Site): Draft => ({ name: s.name, kind: s.kind, people: s.people, km: Number(s.km), direction: s.direction, contact_phone: s.contact_phone });

export function SitesEditor({ sites }: { sites: Site[] }) {
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      setError(r.ok ? "" : r.error ?? "Something went wrong.");
    });

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-semibold">Beneficiary sites</h2>
        <span className="text-[13px] text-muted">Changes save when you leave a field</span>
      </div>
      {error && <p className="text-sm text-crit">{error}</p>}
      <table className={cardTable}>
        <thead>
          <tr><th className="th">Site</th><th className="th">Type</th><th className="th">People to feed</th><th className="th">Road km</th><th className="th">Direction</th><th className="th">Contact phone</th><th className="th"></th></tr>
        </thead>
        <tbody>
          {sites.map((s) => (
            <SiteRow key={s.id} site={s} onSave={(d) => run(() => saveSite({ id: s.id, ...d }))} onRemove={() => run(() => removeSite(s.id))} pending={pending} />
          ))}
          {adding && (
            <SiteRow
              site={null}
              pending={pending}
              onSave={(d) => run(async () => { const r = await saveSite(d); if (r.ok) setAdding(false); return r; })}
              onRemove={() => setAdding(false)}
            />
          )}
        </tbody>
      </table>
      {!sites.length && !adding && <div className="empty">No sites yet. Add the places you’ll deliver to.</div>}
      {!adding && <button className="btn-line self-start" onClick={() => setAdding(true)}>Add site</button>}
    </section>
  );
}

function SiteRow({ site, onSave, onRemove, pending }: { site: Site | null; onSave: (d: Draft) => void; onRemove: () => void; pending: boolean }) {
  const [d, setD] = useState<Draft>(site ? toDraft(site) : { name: "", kind: "Community", people: 50, km: 3, direction: "N", contact_phone: "" });
  const isNew = !site;
  const changed = site ? JSON.stringify(toDraft(site)) !== JSON.stringify(d) : false;
  const commit = () => { if (!isNew && changed && d.name.trim()) onSave(d); };
  const hf = site ? historyForecast(site.history, site.capacity) : null;
  const id = site?.id ?? "new";

  return (
    <tr>
      <td className="cell" data-label="Site"><input id={`s-${id}-name`} className="input min-w-36" value={d.name} placeholder="Site name" onChange={(e) => setD({ ...d, name: e.target.value })} onBlur={commit} /></td>
      <td className="cell" data-label="Type">
        <select id={`s-${id}-kind`} className="input" value={d.kind} onChange={(e) => { const n = { ...d, kind: e.target.value as SiteKind }; setD(n); if (!isNew) onSave(n); }}>
          {KINDS.map((k) => <option key={k}>{k}</option>)}
        </select>
      </td>
      <td className="cell" data-label="People to feed">
        <input id={`s-${id}-people`} className="input w-24 font-mono max-md:w-full" type="number" min={0} step={5}
          value={d.people ?? (site ? siteNeed(site) : "")}
          onChange={(e) => setD({ ...d, people: e.target.value === "" ? null : Number(e.target.value) })} onBlur={commit} />
        {site && site.people == null && hf != null && <div className="mt-0.5 font-mono text-xs text-muted">from {site.history.join(" → ")}</div>}
      </td>
      <td className="cell" data-label="Road km"><input id={`s-${id}-km`} className="input w-20 font-mono max-md:w-full" type="number" min={0.5} step={0.5} value={d.km} onChange={(e) => setD({ ...d, km: Number(e.target.value) })} onBlur={commit} /></td>
      <td className="cell" data-label="Direction">
        <select id={`s-${id}-dir`} className="input" value={d.direction} onChange={(e) => { const n = { ...d, direction: e.target.value as Direction }; setD(n); if (!isNew) onSave(n); }}>
          {DIRECTIONS.map((k) => <option key={k}>{k}</option>)}
        </select>
      </td>
      <td className="cell" data-label="Contact phone"><input id={`s-${id}-phone`} className="input min-w-32" type="tel" value={d.contact_phone ?? ""} onChange={(e) => setD({ ...d, contact_phone: e.target.value })} onBlur={commit} /></td>
      <td className="cell" data-label="">
        {isNew ? (
          <div className="flex gap-3">
            <button className="btn-dark py-1.5" disabled={pending || !d.name.trim()} onClick={() => onSave(d)}>Save</button>
            <button className="link" onClick={onRemove}>Cancel</button>
          </div>
        ) : (
          <button className="link" disabled={pending} onClick={onRemove}>Remove</button>
        )}
      </td>
    </tr>
  );
}
