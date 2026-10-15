import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { getActiveEvent } from "@/lib/data";
import { signOut } from "./actions";
import { Nav } from "./nav";
import { Clock } from "./clock";
import { ToastProvider } from "./toast";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect("/login");
  const event = await getActiveEvent();

  return (
    <ToastProvider>
      <header className="no-print sticky top-0 z-20 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1120px] items-center gap-3 px-4 py-2.5 sm:px-6">
          <div className="flex shrink-0 items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/fap-logo.png" alt="Feed a Person" className="h-7 w-auto" />
            <b className="text-base">FAP <span className="text-blue">AI</span></b>
          </div>
          <span className="min-w-0 truncate rounded-full bg-soft px-2.5 py-1 text-xs font-medium text-ink" title={event ? event.name : undefined}>
            {event ? event.name : "No active event"}
          </span>
          <span className="flex-1" />
          <Clock />
          <form action={signOut}>
            <button className="link">Sign out</button>
          </form>
        </div>
      </header>
      <div className="wrap">
        <Nav />
        <main className="flex flex-col gap-10 pt-8">{children}</main>
      </div>
    </ToastProvider>
  );
}
