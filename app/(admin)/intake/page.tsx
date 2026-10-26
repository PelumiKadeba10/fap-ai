import Link from "next/link";
import { ChevronRight, MapPinned, PencilLine } from "lucide-react";
import { getActiveEvent, getBatches, getCollectionPoints, getDeliveries, getFoodDonations, getPhotoUrls, getPledges, getUnreadByPoint, sumBy } from "@/lib/data";
import { waitingByHub } from "@/lib/food-waiting";
import { n0 } from "@/lib/format";
import { EmptyState, PageHeader, SectionCard, Stat } from "../ui";
import { IntakeBox } from "./intake-box";
import { BatchTable } from "./batch-table";
import { NeedsChecking } from "./needs-checking";
import { PickupsCard } from "./pickups-card";
import { SetupSummary } from "../setup-summary";
import { IntakeSectionLinks } from "./section-links";
import { PointCards, type PointStats } from "./point-cards";

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
  const unread = await getUnreadByPoint(event.id);
  const photos = await getPhotoUrls([...approved, ...pending]);
  const sent = sumBy(deliveries, (d) => d.batch_id, (d) => d.qty);
  const waiting = waitingByHub(approved, deliveries);
  const pointNames = Object.fromEntries(points.map((p) => [p.id, p.name]));
  const reportFood = [...approved, ...pending].reduce((n, b) => n + b.qty, 0);
  const pickupPacks = pledges.filter((p) => p.status === "picked_up").reduce((n, p) => n + (p.picked_up_packs ?? 0), 0);
  const donatedPacks = donations.reduce((n, d) => n + d.packs, 0);

  const sumFor = <T extends { collection_point_id: string | null }>(rows: T[], id: string, n: (r: T) => number) => rows.filter((r) => r.collection_point_id === id).reduce((t, r) => t + n(r), 0);
  const pointStats: Record<string, PointStats> = Object.fromEntries(points.map((p) => [p.id, {
    waiting: waiting[p.id]?.portions ?? 0,
    reported: sumFor([...approved, ...pending], p.id, (b) => b.qty),
    pickedUp: sumFor(pledges.filter((x) => x.status === "picked_up"), p.id, (x) => x.picked_up_packs ?? 0),
    donated: sumFor(donations, p.id, (d) => d.packs),
    unread: unread[p.id] ?? 0,
  }]));

  return (
    <>
      <PageHeader
        title="Check what the collection points send."
        description="Each collection point reports food from its own link. Check every submission before it is matched. FAP AI scores its urgency."
      />
      <IntakeSectionLinks />

      <SetupSummary points={points.length} />

      {points.some((p) => p.active) && (
        <SectionCard id="collection-points" title="Collection points" icon={MapPinned} accent="blue" count={points.filter((p) => p.active).length} aside="what each point has sent, and its links">
        <PointCards points={points.filter((p) => p.active)} stats={pointStats} siteUrl={process.env.SITE_URL ?? ""} />
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
