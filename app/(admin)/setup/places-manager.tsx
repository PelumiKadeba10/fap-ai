"use client";
import { useId, useMemo, useState } from "react";
import { MapPin, Plus, Search } from "lucide-react";
import type { Direction, EventPlace, Site, SiteKind } from "@/lib/types";
import { DIRECTIONS, siteNeed } from "@/lib/match";
import { n0 } from "@/lib/format";
import { Spinner } from "@/components/spinner";
import { addEventSite, createPlace, removeEventSite, setEventSitePeople, updatePlaceDetails } from "../actions";
import { EmptyState, SectionCard, SectionHead } from "../ui";
import { useAction } from "../use-action";

const KINDS: SiteKind[] = ["School", "Community", "Care home", "Shelter", "Other"];

type Details = { name: string; kind: SiteKind; km: number; direction: Direction; contact_name: string; contact_phone: string };
const toDetails = (s: Site): Details => ({ name: s.name, kind: s.kind, km: Number(s.km), direction: s.direction, contact_name: s.contact_name ?? "", contact_phone: s.contact_phone ?? "" });
const EMPTY: Details = { name: "", kind: "Community", km: 3, direction: "N", contact_name: "", contact_phone: "" };

/** This event's places: how many people each needs fed here, plus adding saved or new places. */
export function PlacesManager({ places, saved }: { places: EventPlace[]; saved: Site[] }) {
  const { pending, busy, run } = useAction();
  const inEvent = new Set(places.map((p) => p.id));
  const total = places.reduce((t, p) => t + p.people, 0);

  return (
    <SectionCard id="places" title="Places for this event" icon={MapPin} accent="blue" count={places.length} aside={<><span className="font-mono">{n0(total)}</span> people</>}>

      {places.length === 0 ? (
        <EmptyState icon={MapPin}>No places for this event yet. Add the places you will deliver to.</EmptyState>
      ) : (
        <ul>
          {places.map((p) => (
            <PlaceRow key={p.id} place={p} pending={pending}
              savingPeople={busy("people:" + p.id)} removing={busy("rm:" + p.id)} savingDetails={busy("details:" + p.id)}
              onPeople={(n) => run("people:" + p.id, () => setEventSitePeople(p.id, n))}
              onRemove={() => run("rm:" + p.id, () => removeEventSite(p.id))}
              onDetails={(d, after) => run("details:" + p.id, () => updatePlaceDetails(p.id, d), after)} />
          ))}
        </ul>
      )}

      <AddPlace available={saved.filter((s) => !inEvent.has(s.id))} pending={pending} busy={busy}
        onAddSaved={(id, people, after) => run("add:" + id, () => addEventSite(id, people), after)}
        onCreate={(d, people, after) => run("create", () => createPlace({ ...d, people }), after)} />
    </SectionCard>
  );
}

function PlaceRow({ place: p, pending, savingPeople, removing, savingDetails, onPeople, onRemove, onDetails }: {
  place: EventPlace; pending: boolean; savingPeople: boolean; removing: boolean; savingDetails: boolean;
  onPeople: (n: number) => void; onRemove: () => void; onDetails: (d: Details, after: () => void) => void;
}) {
  const [people, setPeople] = useState(String(p.people));
  const [editing, setEditing] = useState(false);
  const [d, setD] = useState<Details>(toDetails(p));
  const id = useId();
  const commit = () => { const n = Number(people); if (people !== "" && Number.isFinite(n) && n >= 0 && n !== p.people) onPeople(Math.round(n)); };

  return (
    <li className="border-t border-line py-3.5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="font-semibold break-words">{p.name}</p>
          <p className="text-[13px] text-muted">{p.kind} · <span className="font-mono">{Number(p.km)} km {p.direction}</span>{p.contact_phone ? <> · <span className="font-mono">{p.contact_phone}</span></> : null}</p>
        </div>
        <label className="label w-28 items-end text-right" htmlFor={id + "-people"}>
          People to feed
          <input id={id + "-people"} className="input-quiet text-right font-mono" type="number" min={0} step={5} value={people}
            onChange={(e) => setPeople(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} aria-busy={savingPeople} />
        </label>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <button className="link" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>{editing ? "Close details" : "Edit place details"}</button>
        <button className="link-danger inline-flex items-center gap-1.5" disabled={pending} aria-busy={removing} onClick={onRemove} aria-label={"Remove " + p.name + " from this event"}>
          {removing && <Spinner className="size-3.5" />}{removing ? "Removing…" : "Remove from this event"}
        </button>
        {savingPeople && <span className="inline-flex items-center gap-1.5 text-xs text-muted" role="status"><Spinner className="size-3.5" />Saving…</span>}
      </div>

      {editing && (
        <div className="mt-3 flex flex-col gap-3 rounded-xl bg-soft p-4">
          <p className="text-[13px] font-medium">Changes apply to all events.</p>
          <DetailsFields d={d} setD={setD} idPrefix={id} />
          <div className="flex items-center gap-4">
            <button className="btn-dark min-h-9 py-1.5" disabled={pending || !d.name.trim()} aria-busy={savingDetails} onClick={() => onDetails(d, () => setEditing(false))}>
              {savingDetails && <Spinner />}{savingDetails ? "Saving…" : "Save details"}
            </button>
            <button className="link" onClick={() => { setD(toDetails(p)); setEditing(false); }}>Cancel</button>
          </div>
        </div>
      )}
    </li>
  );
}

function DetailsFields({ d, setD, idPrefix }: { d: Details; setD: (d: Details) => void; idPrefix: string }) {
  return (
    <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
      <label className="label sm:col-span-2">Name<input id={idPrefix + "-name"} className="input" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></label>
      <label className="label">Type
        <select className="input" value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value as SiteKind })}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="label">Road km<input className="input font-mono" type="number" min={0.5} step={0.5} value={d.km} onChange={(e) => setD({ ...d, km: Number(e.target.value) })} /></label>
        <label className="label">Direction
          <select className="input" value={d.direction} onChange={(e) => setD({ ...d, direction: e.target.value as Direction })}>{DIRECTIONS.map((k) => <option key={k}>{k}</option>)}</select>
        </label>
      </div>
      <label className="label">Contact name<input className="input" value={d.contact_name} onChange={(e) => setD({ ...d, contact_name: e.target.value })} /></label>
      <label className="label">Contact phone<input className="input font-mono" type="tel" value={d.contact_phone} onChange={(e) => setD({ ...d, contact_phone: e.target.value })} /></label>
    </div>
  );
}

/** Combobox over the saved places, with a way to create a new one. */
function AddPlace({ available, pending, busy, onAddSaved, onCreate }: {
  available: Site[]; pending: boolean; busy: (k: string) => boolean;
  onAddSaved: (siteId: string, people: number, after: () => void) => void;
  onCreate: (d: Details, people: number, after: () => void) => void;
}) {
  const listId = useId();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [picked, setPicked] = useState<Site | null>(null);
  const [creating, setCreating] = useState(false);
  const [people, setPeople] = useState("50");
  const [d, setD] = useState<Details>(EMPTY);

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    return available.filter((s) => !t || s.name.toLowerCase().includes(t)).slice(0, 8);
  }, [available, q]);
  const canCreate = q.trim().length > 0 && !available.some((s) => s.name.toLowerCase() === q.trim().toLowerCase());
  const options: ({ kind: "site"; site: Site } | { kind: "create" })[] = [...matches.map((site) => ({ kind: "site" as const, site })), ...(canCreate ? [{ kind: "create" as const }] : [])];

  const reset = () => { setQ(""); setOpen(false); setPicked(null); setCreating(false); setD(EMPTY); setPeople("50"); setActive(0); };
  function choose(o: (typeof options)[number]) {
    setOpen(false);
    if (o.kind === "site") { setPicked(o.site); setCreating(false); setPeople(String(siteNeed(o.site) || 50)); setQ(o.site.name); }
    else { setPicked(null); setCreating(true); setD({ ...EMPTY, name: q.trim() }); setPeople("50"); }
  }
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, options.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && open && options[active]) { e.preventDefault(); choose(options[active]); }
    else if (e.key === "Escape") setOpen(false);
  }
  const n = Number(people);
  const peopleOk = people !== "" && Number.isFinite(n) && n >= 0;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-dashed border-[#dde2e7] p-4">
      <div className="relative">
        <label className="label" htmlFor={listId + "-input"}>Add a place
          <span className="relative block">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              id={listId + "-input"} className="input pl-9" role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
              aria-activedescendant={open && options[active] ? listId + "-" + active : undefined}
              placeholder="Search saved places, or type a new name" value={q} autoComplete="off"
              onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); setPicked(null); setCreating(false); }}
              onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)} onKeyDown={onKeyDown}
            />
          </span>
        </label>
        {open && options.length > 0 && (
          <ul id={listId} role="listbox" className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-[#dde2e7] bg-white py-1 shadow-sm">
            {options.map((o, i) => (
              <li key={o.kind === "site" ? o.site.id : "create"} id={listId + "-" + i} role="option" aria-selected={i === active}
                className={"flex min-h-10 cursor-pointer items-center justify-between gap-3 px-3 text-[15px] " + (i === active ? "bg-soft" : "")}
                onMouseDown={(e) => { e.preventDefault(); choose(o); }} onMouseEnter={() => setActive(i)}>
                {o.kind === "site"
                  ? <><span className="min-w-0 truncate">{o.site.name}</span><span className="shrink-0 text-xs text-muted">{o.site.kind} · {Number(o.site.km)} km</span></>
                  : <span className="flex items-center gap-1.5 font-medium"><Plus className="size-4" aria-hidden />Create “{q.trim()}” as a new place</span>}
              </li>
            ))}
          </ul>
        )}
        {open && options.length === 0 && q.trim() === "" && <p className="mt-1.5 text-[13px] text-muted">All saved places are already on this event. Type a name to create a new one.</p>}
      </div>

      {picked && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="label w-36">People to feed here<input className="input font-mono" type="number" min={0} step={5} value={people} onChange={(e) => setPeople(e.target.value)} /></label>
          <button className="btn-dark" disabled={pending || !peopleOk} aria-busy={busy("add:" + picked.id)} onClick={() => onAddSaved(picked.id, Math.round(n), reset)}>
            {busy("add:" + picked.id) && <Spinner />}{busy("add:" + picked.id) ? "Adding…" : "Add to this event"}
          </button>
          <button className="link pb-2.5" onClick={reset}>Cancel</button>
        </div>
      )}

      {creating && (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-muted">New places are saved to the shared list, so other events can use them too.</p>
          <DetailsFields d={d} setD={setD} idPrefix={listId + "-new"} />
          <label className="label w-36">People to feed here<input className="input font-mono" type="number" min={0} step={5} value={people} onChange={(e) => setPeople(e.target.value)} /></label>
          <div className="flex items-center gap-4">
            <button className="btn-dark" disabled={pending || !d.name.trim() || !peopleOk} aria-busy={busy("create")} onClick={() => onCreate(d, Math.round(n), reset)}>
              {busy("create") && <Spinner />}{busy("create") ? "Saving…" : "Create and add"}
            </button>
            <button className="link" onClick={reset}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
