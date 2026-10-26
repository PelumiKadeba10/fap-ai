import Link from "next/link";
import { History, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime, n0 } from "@/lib/format";
import { EmptyState, PageHeader, Pill, SectionCard, cardTable } from "../ui";
import { getActiveEvent } from "@/lib/data";

export const dynamic = "force-dynamic";

type Log = {
  id: number;
  action: "created" | "deleted";
  entity_type: string;
  entity_id: string;
  actor_label: string;
  details: Record<string, unknown>;
  created_at: string;
};

const ENTITY: Record<string, string> = {
  events: "event",
  event_sites: "beneficiary site",
  collection_points: "collection point",
  batches: "food batch",
  deliveries: "delivery",
  trips: "trip",
  buses: "bus",
  bus_links: "bus link",
  pledges: "pledge",
  edible_counts: "edible count",
  status_updates: "delivery status",
};

function description(log: Log) {
  const d = log.details ?? {};
  const name = typeof d.food === "string" ? d.food : typeof d.name === "string" ? d.name : typeof d.tent_name === "string" ? d.tent_name : "";
  const qty = typeof d.qty === "number" ? ` · ${n0(d.qty)} packs` : "";
  const thing = ENTITY[log.entity_type] ?? log.entity_type.replaceAll("_", " ");
  return `${log.action === "created" ? "Created" : "Deleted"} ${thing}${name ? `: ${name}` : ""}${qty}`;
}

export default async function AuditPage() {
  const event = await getActiveEvent();
  if (!event) return <EmptyState action={<Link href="/event">Set up the event</Link>}>Create the event first.</EmptyState>;
  const supabase = await createClient();
  const { data, error } = await supabase.from("audit_logs").select("id, action, entity_type, entity_id, actor_label, details, created_at").eq("event_id", event.id).order("created_at", { ascending: false }).limit(300);
  if (error) throw error;
  const logs = (data ?? []) as Log[];

  return (
    <>
      <PageHeader title={`Audit log · ${event.name}`} description="A record of items created and deleted for this event." />
      <SectionCard id="audit" title="Activity" icon={History} accent="blue" count={logs.length}>
        {logs.length === 0 ? <EmptyState icon={History}>No creation or deletion activity has been recorded for this event yet.</EmptyState> : (
          <table className={cardTable}>
            <thead><tr><th className="th">Action</th><th className="th">Item</th><th className="th">Who</th><th className="th">When</th><th className="th">ID</th></tr></thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="cell" data-label="Action"><Pill tone={log.action === "created" ? "green" : "red"} icon={log.action === "created" ? Plus : Trash2}>{log.action === "created" ? "Created" : "Deleted"}</Pill></td>
                  <td className="cell" data-label="Item">{description(log)}</td>
                  <td className="cell" data-label="Who">{log.actor_label}</td>
                  <td className="cell font-mono" data-label="When">{fmtDateTime(log.created_at)}</td>
                  <td className="cell max-w-[18rem] break-all font-mono text-xs text-muted" data-label="ID">{log.entity_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>
    </>
  );
}
