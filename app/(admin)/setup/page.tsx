import Link from "next/link";
import { getActiveEvent, getBusLinks, getBusyBusIds, getBuses, getCollectionPoints, getEventSites, getEvents, getPledges, getSites, ensureBusLinksForEvent } from "@/lib/data";
import { toLagosInput } from "@/lib/format";
import { EmptyState, PageHeader } from "../ui";
import { BusesManager } from "./buses-manager";
import { CartonsSetting } from "./cartons-setting";
import { CollectionPointsManager } from "./collection-points-manager";
import { CopySetup } from "./copy-setup";
import { PlacesManager } from "./places-manager";
import { PledgesManager } from "./pledges-manager";

export const dynamic = "force-dynamic";

/** Everything this event needs before it starts: where food goes, where it is collected, and what carries it. */
export default async function SetupPage() {
  const event = await getActiveEvent();
  if (!event) return <EmptyState action={<Link href="/event?new=1">Create an event</Link>}>Create an event first, then set it up here.</EmptyState>;

  await ensureBusLinksForEvent(event.id); // every bus has its link for this event from the start
  const [places, saved, points, buses, links, busyIds, events, pledges] = await Promise.all([
    getEventSites(event.id), getSites(), getCollectionPoints(event.id), getBuses(event.id), getBusLinks(event.id), getBusyBusIds(), getEvents(), getPledges(event.id),
  ]);
  const previous = events.find((e) => e.id !== event.id && e.starts_at < event.starts_at);
  const empty = places.length === 0 && points.length === 0 && buses.length === 0;

  return (
    <>
      <PageHeader
        title="Set up this event"
        description="The places you deliver to, the collection points that report food, the tents that pledged food, and the buses that carry it. Each event has its own setup."
      />
      {empty && previous && <CopySetup from={{ id: previous.id, name: previous.name }} />}
      <PlacesManager places={places} saved={saved} />
      <CollectionPointsManager points={points} siteUrl={process.env.SITE_URL ?? ""} />
      <CartonsSetting value={event.packs_per_carton} />
      <PledgesManager
        pledges={pledges} points={points}
        defaultPickup={toLagosInput(event.food_from ?? new Date(new Date(event.starts_at).getTime() + event.duration_hours * 3600_000))}
      />
      <BusesManager
        packsPerCarton={event.packs_per_carton}
        buses={buses} links={links.map((l) => ({ bus_id: l.bus_id, token: l.token }))}
        busyIds={busyIds} siteUrl={process.env.SITE_URL ?? ""} eventName={event.name}
      />
    </>
  );
}
