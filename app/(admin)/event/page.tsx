import { getActiveEvent } from "@/lib/data";
import { EventForm } from "./event-form";

export default async function EventPage() {
  const event = await getActiveEvent();
  return (
    <>
      <div>
        <p className="eyebrow">Step 1 · Before the event</p>
        <h1 className="h1">How much food will be left over?</h1>
        <p className="lede">Enter the event details to estimate surplus and plan volunteers and transport.</p>
      </div>
      <EventForm event={event} />
    </>
  );
}
