import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { getActiveEvent } from "@/lib/data";
import { signOut } from "./actions";
import { Nav } from "./nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect("/login");
  const event = await getActiveEvent();

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center gap-3.5 px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/fap-logo.png" alt="Feed a Person" className="h-7 w-auto" />
            <b className="text-base">FAP <span className="text-sky">AI</span></b>
          </div>
          <span className="hidden text-[13px] text-muted sm:inline">{event ? event.name : "No active event"}</span>
          <span className="flex-1" />
          <form action={signOut}>
            <button className="link">Sign out</button>
          </form>
        </div>
      </header>
      <div className="wrap">
        <Nav />
        <main className="flex flex-col gap-9 pt-8">{children}</main>
      </div>
    </>
  );
}
