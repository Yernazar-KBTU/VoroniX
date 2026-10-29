import { EventEmitter } from "node:events";
import type { Request, Response } from "express";

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

export type BusEvent =
  | { type: "changed"; resources: Resource[] }
  | { type: "ai"; conversation_id: string; status: string | null }
  | { type: "message"; conversation_id: string; from: string; text: string; messenger: string; external_user_id: string };

class Bus extends EventEmitter {
  publish(e: BusEvent) {
    this.emit("event", e);
  }
  changed(...resources: Resource[]) {
    this.publish({ type: "changed", resources });
  }
}

/** In-process event bus. The web client listens through Server-Sent Events. */
export const bus = new Bus();
bus.setMaxListeners(1000);

/** GET /api/events: pushes every bus event to the browser. */
export function sseHandler(req: Request, res: Response) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write("retry: 2000\n\n");
  const send = (e: BusEvent) => {
    if (e.type === "message") return; // internal, for channel adapters
    res.write(`data: ${JSON.stringify(e)}\n\n`);
  };
  const ping = setInterval(() => res.write(": ping\n\n"), 25_000);
  bus.on("event", send);
  req.on("close", () => {
    clearInterval(ping);
    bus.off("event", send);
  });
}
