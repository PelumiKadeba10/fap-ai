import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { getActiveEvent, getEvents, getFoodWaiting } from "@/lib/data";
import { Header } from "./header";
import { Nav } from "./nav";
import { ToastProvider } from "./toast";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect("/login");
  const [event, events] = await Promise.all([getActiveEvent(), getEvents()]);
  // Portions of approved food not yet in a delivery, shown on the Match & route tab.
  const badges: Record<string, number> = event ? { "/match": (await getFoodWaiting(event.id)).portions } : {};

  return (
    <ToastProvider>
      <Header events={events} currentId={event?.id ?? null} badges={badges} />
      <div className="wrap">
        <Nav badges={badges} />
        <main className="flex flex-col gap-10 pt-8">{children}</main>
      </div>
    </ToastProvider>
  );
}
