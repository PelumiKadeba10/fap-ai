import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { getActiveEvent, getEventCounts } from "@/lib/data";
import { Header } from "./header";
import { Nav } from "./nav";
import { ToastProvider } from "./toast";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect("/login");
  const event = await getActiveEvent();
  // Waiting work for the tab badges: batches to check, and portions not yet on a trip.
  const counts = event ? await getEventCounts(event.id) : { pendingBatches: 0, portionsWaiting: 0 };

  return (
    <ToastProvider>
      <Header eventId={event?.id ?? null} eventName={event?.name ?? null} counts={counts} />
      <div className="wrap">
        <Nav counts={counts} />
        <main className="flex flex-col gap-10 pt-8">{children}</main>
      </div>
    </ToastProvider>
  );
}
