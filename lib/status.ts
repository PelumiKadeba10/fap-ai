import type { DeliveryStatus } from "./types";

export const STATUS: Record<DeliveryStatus, { label: string; tone: "muted" | "blue" | "orange" | "red" | "green" }> = {
  assigned: { label: "Assigned", tone: "muted" },
  picked_up: { label: "Picked up", tone: "blue" },
  on_the_way: { label: "On the way", tone: "blue" },
  delayed: { label: "Delayed", tone: "orange" },
  delivered: { label: "Delivered", tone: "green" },
};

/** Which updates a volunteer can send next. */
export const NEXT_STATUS: Record<DeliveryStatus, DeliveryStatus[]> = {
  assigned: ["picked_up"],
  picked_up: ["on_the_way", "delayed"],
  on_the_way: ["delivered", "delayed"],
  delayed: ["on_the_way", "delivered"],
  delivered: [],
};

export const ACTION_LABEL: Record<DeliveryStatus, string> = {
  assigned: "Assigned",
  picked_up: "I've picked it up",
  on_the_way: "I'm on the way",
  delayed: "I'm delayed",
  delivered: "Delivered",
};

export function canMove(from: DeliveryStatus, to: DeliveryStatus) {
  return NEXT_STATUS[from].includes(to);
}

/** Within this many minutes of the safe time, a delivery needs attention. */
export const ATTENTION_MIN = 20;
