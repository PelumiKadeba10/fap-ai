import { getActiveEvent } from "@/lib/data";
import { PageHeader } from "../ui";
import { EventForm } from "./event-form";

export default async function EventPage() {
  const event = await getActiveEvent();
  return (
    <>
      <PageHeader
        eyebrow="Step 1 · Before the event"
        title="How much food will be left over?"
        description="Enter the event details to estimate surplus and plan volunteers and transport."
      />
      <EventForm event={event} />
    </>
  );
}
