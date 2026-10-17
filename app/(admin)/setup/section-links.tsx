const LINKS = [
  { href: "#places", label: "Places" },
  { href: "#collection-points", label: "Collection points" },
  { href: "#cartons", label: "Cartons" },
  { href: "#pledges", label: "Pledged tents" },
  { href: "#buses", label: "Buses" },
];

/** Sticky row of links that jump to each Setup card. Plain anchors, so it works without JavaScript. */
export function SectionLinks() {
  return (
    <nav aria-label="Setup sections" className="sticky top-14 z-10 -mx-4 border-b border-line bg-white/95 px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:px-3">
      <ul className="flex gap-2 overflow-x-auto">
        {LINKS.map((l) => (
          <li key={l.href} className="shrink-0">
            <a href={l.href} className="flex min-h-11 items-center rounded-full border border-line px-3.5 text-sm font-medium hover:bg-soft sm:min-h-9">{l.label}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
