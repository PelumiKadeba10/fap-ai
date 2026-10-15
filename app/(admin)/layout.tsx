import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { getActiveEvent, getEvents } from "@/lib/data";
import { Header } from "./header";
import { Nav } from "./nav";
import { ToastProvider } from "./toast";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect("/login");
  const [event, events] = await Promise.all([getActiveEvent(), getEvents()]);

  return (
    <ToastProvider>
      <Header events={events} currentId={event?.id ?? null} />
      <div className="wrap">
        <Nav />
        <main className="flex flex-col gap-10 pt-8">{children}</main>
      </div>
    </ToastProvider>
  );
}
