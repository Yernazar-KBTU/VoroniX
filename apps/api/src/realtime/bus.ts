import { EventEmitter } from "node:events";
import type { Request, Response } from "express";
import { currentTenant } from "../tenancy/context.js";

export type Resource =
  | "settings"
  | "services"
  | "masters"
  | "master_services"
  | "clients"
  | "client_channels"
  | "appointments"
  | "payments"
  | "conversations"
  | "knowledge";

type Payload =
  | { type: "changed"; resources: Resource[] }
  | { type: "ai"; conversation_id: string; status: string | null }
  | { type: "voronix"; state: "off" | "ok" | "down"; error: string | null }
  | { type: "message"; conversation_id: string; from: string; text: string; messenger: string; external_user_id: string }
  | { type: "domain"; name: "appointment.created" | "payment.paid"; data: Record<string, unknown> };

/** An event, stamped with the business it happened in. Listeners must only act on their own business's events. */
export type BusEvent = Payload & { tenant?: string };

class Bus extends EventEmitter {
  publish(e: Payload) {
    this.emit("event", { ...e, tenant: currentTenant()?.id });
  }
  changed(...resources: Resource[]) {
    this.publish({ type: "changed", resources });
  }
}

/** In-process event bus. The web client listens through Server-Sent Events. */
export const bus = new Bus();
bus.setMaxListeners(1000);

/** GET /api/events: pushes the events of the signed-in business to the browser. */
export function sseHandler(req: Request, res: Response) {
  const tenant = currentTenant()?.id;
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write("retry: 2000\n\n");
  const send = (e: BusEvent) => {
    if (e.type === "message" || (e.tenant !== tenant && e.type !== "voronix")) return; // "message" is internal, for channel adapters; VoroniX AI's state is the same for every business
    const { tenant: _own, ...out } = e;
    res.write(`data: ${JSON.stringify(out)}\n\n`);
  };
  const ping = setInterval(() => res.write(": ping\n\n"), 25_000);
  bus.on("event", send);
  req.on("close", () => {
    clearInterval(ping);
    bus.off("event", send);
  });
}
