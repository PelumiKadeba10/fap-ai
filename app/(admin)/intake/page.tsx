import Link from "next/link";
import { ChevronRight, MapPinned, PencilLine } from "lucide-react";
import { getActiveEvent, getBatches, getCollectionPoints, getDeliveries, getFoodDonations, getPhotoUrls, getPledges, sumBy } from "@/lib/data";
import { waitingByHub } from "@/lib/food-waiting";
import { n0 } from "@/lib/format";
import { EmptyState, PageHeader, SectionCard, Stat } from "../ui";
import { IntakeBox } from "./intake-box";
import { BatchTable } from "./batch-table";
import { NeedsChecking } from "./needs-checking";
import { PickupsCard } from "./pickups-card";
import { SetupSummary } from "../setup-summary";
import { IntakeSectionLinks } from "./section-links";

export default async function IntakePage() {
  const event = await getActiveEvent();
  if (!event) {
    return <EmptyState action={<Link href="/event?new=1">Create an event</Link>}>Create the event first.</EmptyState>;
  }
  const [approved, pending, points, deliveries, pledges, donations] = await Promise.all([
    getBatches(event.id, "approved"),
    getBatches(event.id, "pending"),
    getCollectionPoints(event.id),
    getDeliveries(event.id),
    getPledges(event.id),
    getFoodDonations(event.id),
  ]);
  const photos = await getPhotoUrls([...approved, ...pending]);
  const sent = sumBy(deliveries, (d) => d.batch_id, (d) => d.qty);
  const waiting = waitingByHub(approved, deliveries);
  const pointNames = Object.fromEntries(points.map((p) => [p.id, p.name]));
  const reportFood = [...approved, ...pending].reduce((n, b) => n + b.qty, 0);
  const pickupPacks = pledges.filter((p) => p.status === "picked_up").reduce((n, p) => n + (p.picked_up_packs ?? 0), 0);
  const donatedPacks = donations.reduce((n, d) => n + d.packs, 0);

  return (
    <>
      <PageHeader
        title="Check what the collection points send."
        description="Each collection point reports food from its own link. Check every submission before it is matched. FAP AI scores its urgency."
      />
      <IntakeSectionLinks />

      <SetupSummary points={points.length} />

      {points.some((p) => p.active) && (
        <SectionCard id="collection-points" title="Collection points" icon={MapPinned} accent="blue" count={points.filter((p) => p.active).length} aside="volunteers and packs waiting">
        <ul className="flex flex-col gap-1 text-[15px]" aria-label="Collection points">
          {points.filter((p) => p.active).map((p) => (
            <li key={p.id}>
              <b className="font-semibold">{p.name}</b>
              {p.volunteers != null && <> · <span className="font-mono">{p.volunteers}</span> {p.volunteers === 1 ? "volunteer" : "volunteers"}</>}
              {" "}· <span className="font-mono">{n0(waiting[p.id]?.portions ?? 0)}</span> packs waiting
            </li>
          ))}
        </ul>
        <div className="mt-5 grid grid-cols-1 gap-4 border-t border-line pt-4 sm:grid-cols-3">
          <Stat label="Report food" value={`${n0(reportFood)} packs`} hint="Operational food reports" />
          <Stat label="Pick-ups" value={`${n0(pickupPacks)} packs`} hint="Confirmed pickup statistics" />
          <Stat label="Food donated" value={`${n0(donatedPacks)} packs`} hint="Statistics-only donations" />
        </div>
        </SectionCard>
      )}

      <PickupsCard eventId={event.id} pledges={pledges} pointNames={pointNames} />
      <NeedsChecking eventId={event.id} batches={pending} pointNames={pointNames} photos={photos} />
      <BatchTable batches={approved} sent={Object.fromEntries(sent)} photos={photos} />

      <SectionCard id="add-food" title="Add food yourself" icon={PencilLine} accent="ink" aside="for a collection point that can’t use its link">
        <details className="group">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-base font-semibold [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden />
            Open the form
          </summary>
          <p className="mt-2 mb-6 text-sm text-muted">Use this if a collection point can’t use its link, e.g. no data or a phone call.</p>
          <IntakeBox hubs={points.filter((p) => p.active)} />
        </details>
      </SectionCard>

    </>
  );
}
