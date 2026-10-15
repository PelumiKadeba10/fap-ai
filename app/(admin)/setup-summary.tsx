import Link from "next/link";
import { n0 } from "@/lib/format";

/**
 * One line of this event's setup ("12 places · 2,140 people · 3 buses") with a link to the Setup tab,
 * and a plain prompt for anything that is still missing. Pass only the counts the page cares about.
 */
export function SetupSummary({ places, people, buses, points }: { places?: number; people?: number; buses?: number; points?: number }) {
  const parts: string[] = [];
  if (places !== undefined) parts.push(places + (places === 1 ? " place" : " places"));
  if (people !== undefined) parts.push(n0(people) + " people");
  if (points !== undefined) parts.push(points + (points === 1 ? " collection point" : " collection points"));
  if (buses !== undefined) parts.push(buses + (buses === 1 ? " bus" : " buses"));
  const missing: string[] = [];
  if (places === 0) missing.push("places");
  if (points === 0) missing.push("collection points");
  if (buses === 0) missing.push("active buses");

  return (
    <div className="flex flex-col gap-1.5 border-y border-line py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
        <p className="font-mono text-[15px]">{parts.join(" · ")}</p>
        <Link href="/setup" className="text-sm font-medium underline underline-offset-4">Edit in Setup</Link>
      </div>
      {missing.length > 0 && (
        <p className="text-sm font-medium text-warn">
          This event has no {missing.join(" or ")} yet. <Link href="/setup" className="underline underline-offset-4">Add them in Setup</Link>.
        </p>
      )}
    </div>
  );
}
