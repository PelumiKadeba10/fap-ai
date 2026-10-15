import Link from "next/link";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { getActiveEvent } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "../../impact/print-button";
import { EmptyState, PageHeader } from "../../ui";
import { LoadingList, loadTrips } from "../loading-list";

export const dynamic = "force-dynamic";

/** Every loading list for one hub (trips that haven't left yet), ready to print in one go. */
export default async function HubLoadPage({ searchParams }: { searchParams: Promise<{ hub?: string }> }) {
  const { hub } = await searchParams;
  const event = await getActiveEvent();
  if (!event || !hub) return <EmptyState action={<Link href="/live">Back to Live</Link>}>Choose a collection point from Live.</EmptyState>;

  const supabase = await createClient();
  const trips = await loadTrips(supabase, { eventId: event.id, hub });

  return (
    <>
      <div className="no-print">
        <PageHeader
          eyebrow="Loading lists"
          title={trips[0] ? `All loading lists · ${trips[0].hub}` : "Loading lists"}
          description="Trips from this collection point that haven’t left yet."
          actions={<><Link href="/live" className="btn-line"><ArrowLeft className="size-4" aria-hidden />Live</Link>{trips.length > 0 && <PrintButton />}</>}
        />
      </div>
      {trips.length === 0
        ? <EmptyState icon={ClipboardList}>No trips are waiting to load at this collection point.</EmptyState>
        : trips.map((t) => <LoadingList key={t.id} trip={t} printedAt={new Date()} />)}
    </>
  );
}
