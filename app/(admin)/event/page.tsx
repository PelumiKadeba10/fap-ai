import { getActiveEvent } from "@/lib/data";
import { PageHeader } from "../ui";
import { EventForm } from "./event-form";

export default async function EventPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const { new: isNew } = await searchParams;
  const creating = isNew === "1";
  const event = creating ? null : await getActiveEvent();
  return (
    <>
      <PageHeader
        eyebrow={creating ? "New event" : undefined}
        title={creating ? "New event" : "How much food will be left over?"}
        description={creating
          ? "Its food, deliveries and impact report are kept separate from your other events."
          : "Enter the event details to estimate surplus and plan volunteers and transport."}
      />
      <EventForm key={event?.id ?? "new"} event={event} />
    </>
  );
}
