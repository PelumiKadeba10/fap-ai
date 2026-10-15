import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "../../../impact/print-button";
import { PageHeader } from "../../../ui";
import { LoadingList, loadTrips } from "../../loading-list";

export const dynamic = "force-dynamic";

export default async function TripLoadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const [trip] = await loadTrips(supabase, { id });
  if (!trip) notFound();

  return (
    <>
      <div className="no-print">
        <PageHeader
          eyebrow="Loading list"
          title={`${trip.bus ?? "Trip"} · ${trip.hub}`}
          description="For the sorting team: load each stop’s food in this order and tick it off."
          actions={<><Link href="/live" className="btn-line"><ArrowLeft className="size-4" aria-hidden />Live dispatch</Link><PrintButton /></>}
        />
      </div>
      <LoadingList trip={trip} printedAt={new Date()} />
    </>
  );
}
