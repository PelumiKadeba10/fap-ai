import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getBusyBusIds, getBuses, getSites } from "@/lib/data";
import { PageHeader } from "../ui";
import { BusesManager } from "./buses-manager";
import { SitesEditor } from "./sites-editor";

export const dynamic = "force-dynamic";

/** Places and buses are shared by every event, so they live outside the event tabs. */
export default async function SetupPage() {
  const [sites, buses, busyIds] = await Promise.all([getSites(), getBuses(), getBusyBusIds()]);
  return (
    <>
      <PageHeader
        title="Setup"
        description="The places you deliver to and the buses that carry the food. Shared by every event."
        actions={<Link href="/" className="btn-line"><ArrowLeft className="size-4" aria-hidden />All events</Link>}
      />
      <SitesEditor sites={sites} />
      <BusesManager buses={buses} busyIds={busyIds} />
    </>
  );
}
