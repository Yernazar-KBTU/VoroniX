import { z } from "zod";
import { pool } from "../db/pool.js";
import { prepaymentFor } from "../domain/pricing.js";
import { normDT } from "../lib/time.js";
import { bus } from "../realtime/bus.js";
import { getAppointment, listAppointments } from "../repositories/appointments.repo.js";
import { getMaster, getService } from "../repositories/catalog.repo.js";
import { patchConversation } from "../repositories/conversations.repo.js";
import { getSettings } from "../repositories/settings.repo.js";
import * as booking from "../services/booking.service.js";
import { getOrThrow, linkClient, pushMessage } from "../services/conversation.service.js";

/**
 * CRM actions the AI may take. The AI never runs SQL: each tool is a small,
 * validated backend function (ADR-0002).
 */
export interface ToolSpec {
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required?: string[]; additionalProperties: false };
}

export const TOOL_SPECS: ToolSpec[] = [
  {
    name: "find_free_slots",
    description:
      "Free start times for a service on a date, per master, from the live schedule. Returns {slots:[{master_id,master,times[]}]}. If the day is full, also returns nearest_available.",
    input_schema: {
      type: "object",
      properties: {
        service_code: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD" },
        master_id: { type: "string", description: "optional" },
      },
      required: ["service_code", "date"],
      additionalProperties: false,
    },
  },
  {
    name: "link_client",
    description: "Find or create the client card for this chat and link it. Returns {client_id,is_new}.",
    input_schema: {
      type: "object",
      properties: { name: { type: "string" }, phone: { type: "string" } },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    name: "create_appointment",
    description:
      "Book a visit for the linked client. start_datetime 'YYYY-MM-DD HH:MM'. Checks that the master does the service and the slot is free. Returns the appointment and prepayment_required_kzt.",
    input_schema: {
      type: "object",
      properties: { service_code: { type: "string" }, master_id: { type: "string" }, start_datetime: { type: "string" } },
      required: ["service_code", "master_id", "start_datetime"],
      additionalProperties: false,
    },
  },
  {
    name: "create_payment_link",
    description: "Send the client a payment button in the chat for an appointment. kind 'prepayment' (the required %) or 'full'. Returns the amount.",
    input_schema: {
      type: "object",
      properties: { appointment_id: { type: "string" }, kind: { type: "string", enum: ["prepayment", "full"] } },
      required: ["appointment_id", "kind"],
      additionalProperties: false,
    },
  },
  {
    name: "get_client_appointments",
    description: "List the linked client's visits (past and upcoming) with ids and statuses.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "cancel_or_move_appointment",
    description: "Cancel or move one of this client's appointments. For move give new_start_datetime 'YYYY-MM-DD HH:MM' (must be free).",
    input_schema: {
      type: "object",
      properties: {
        appointment_id: { type: "string" },
        action: { type: "string", enum: ["cancel", "move"] },
        new_start_datetime: { type: "string" },
      },
      required: ["appointment_id", "action"],
      additionalProperties: false,
    },
  },
  {
    name: "handoff_to_human",
    description: "Pass the chat to a human administrator and stop answering. Use for complaints, refunds, medical questions or anything outside the data.",
    input_schema: { type: "object", properties: { reason: { type: "string" } }, required: ["reason"], additionalProperties: false },
  },
];

const Inputs = {
  find_free_slots: z.object({ service_code: z.string(), date: z.string().regex(/^\d{4}-\d\d-\d\d$/), master_id: z.string().optional() }),
  link_client: z.object({ name: z.string().min(1).max(50), phone: z.string().optional() }),
  create_appointment: z.object({ service_code: z.string(), master_id: z.string(), start_datetime: z.string().min(16) }),
  create_payment_link: z.object({ appointment_id: z.string(), kind: z.enum(["prepayment", "full"]) }),
  get_client_appointments: z.object({}),
  cancel_or_move_appointment: z.object({ appointment_id: z.string(), action: z.enum(["cancel", "move"]), new_start_datetime: z.string().optional() }),
  handoff_to_human: z.object({ reason: z.string() }),
};
export type ToolName = keyof typeof Inputs;

export interface ToolContext {
  conversationId: string;
  progress: (status: string) => void;
}

export interface ToolCallLog {
  name: string;
  input: unknown;
  ok: boolean;
  error?: string;
}

const system = (convId: string, text: string) => pushMessage(convId, { from: "system", text });

/** Runs one tool. Errors come back as {error} so the model can recover. */
export async function runTool(name: string, rawInput: unknown, ctx: ToolContext): Promise<{ result: unknown; log: ToolCallLog }> {
  try {
    if (!(name in Inputs)) throw new Error(`Unknown tool ${name}`);
    const input = Inputs[name as ToolName].parse(rawInput ?? {});
    const result = await execute(name as ToolName, input as never, ctx);
    return { result, log: { name, input: rawInput, ok: true } };
  } catch (err) {
    const message = err instanceof z.ZodError ? `Invalid input: ${err.issues.map((i) => i.path.join(".") + " " + i.message).join("; ")}` : (err as Error).message;
    return { result: { error: message }, log: { name, input: rawInput, ok: false, error: message } };
  }
}

async function execute<N extends ToolName>(name: N, i: z.infer<(typeof Inputs)[N]>, ctx: ToolContext): Promise<unknown> {
  const convId = ctx.conversationId;
  switch (name) {
    case "find_free_slots": {
      const a = i as z.infer<typeof Inputs.find_free_slots>;
      ctx.progress("Checking free slots…");
      const r = await booking.findFreeSlots(pool, a.service_code, a.date, a.master_id);
      return { ...r, slots: r.slots.map((s) => ({ ...s, times: s.times.slice(0, 14) })) };
    }
    case "link_client": {
      const a = i as z.infer<typeof Inputs.link_client>;
      ctx.progress("Linking client card…");
      return linkClient(convId, a.name, a.phone);
    }
    case "create_appointment": {
      const a = i as z.infer<typeof Inputs.create_appointment>;
      ctx.progress("Creating the booking…");
      const conv = await getOrThrow(convId);
      if (!conv.client_id) throw new Error("Link the client first with link_client.");
      const appt = await booking.createBooking(
        { client_id: conv.client_id, master_id: a.master_id, service_code: a.service_code, start_datetime: normDT(a.start_datetime), source: conv.messenger },
        { strict: true },
      ).catch((e) => {
        throw new Error(e.code === "slot_taken" ? "This time is not free for this master. Call find_free_slots again and offer other times." : e.message);
      });
      await patchConversation(pool, convId, { stage: "Booked", appointment_id: appt.id });
      const [svc, master, biz] = await Promise.all([getService(pool, appt.service_code), getMaster(pool, appt.master_id), getSettings(pool)]);
      await system(convId, `AI booked ${svc!.name} with ${master!.full_name} on ${appt.start_datetime} (${appt.id}).`);
      return {
        appointment_id: appt.id,
        service: svc!.name,
        master: master!.full_name,
        start_datetime: appt.start_datetime,
        price_kzt: svc!.price_kzt,
        prepayment_required_kzt: prepaymentFor(svc!, biz),
      };
    }
    case "create_payment_link": {
      const a = i as z.infer<typeof Inputs.create_payment_link>;
      ctx.progress("Preparing payment link…");
      const conv = await getOrThrow(convId);
      const appt = await getAppointment(pool, a.appointment_id);
      if (!appt || appt.client_id !== conv.client_id) throw new Error("Unknown appointment_id for this client");
      const p = await booking.createPaymentLink(a.appointment_id, a.kind);
      const svc = await getService(pool, appt.service_code);
      await pushMessage(convId, { from: "pay", payment_id: p.id, text: `Payment for ${svc?.name ?? "visit"}` });
      return { payment_id: p.id, amount_kzt: p.amount_kzt, status: p.status };
    }
    case "get_client_appointments": {
      const conv = await getOrThrow(convId);
      if (!conv.client_id) return { appointments: [], note: "client not linked" };
      const list = await listAppointments(pool, { client_id: conv.client_id });
      return { appointments: list.slice(-8).map((a) => ({ appointment_id: a.id, start_datetime: a.start_datetime, service_code: a.service_code, master_id: a.master_id, status: a.status })) };
    }
    case "cancel_or_move_appointment": {
      const a = i as z.infer<typeof Inputs.cancel_or_move_appointment>;
      const conv = await getOrThrow(convId);
      const appt = await getAppointment(pool, a.appointment_id);
      if (!appt || appt.client_id !== conv.client_id) throw new Error("Appointment not found for this client");
      if (a.action === "cancel") {
        await booking.changeStatus(appt.id, "Cancelled");
        await system(convId, `AI cancelled ${appt.id}.`);
        return { ok: true, status: "Cancelled" };
      }
      if (!a.new_start_datetime) throw new Error("new_start_datetime is required to move");
      const moved = await booking.moveBooking(appt.id, a.new_start_datetime);
      await system(convId, `AI moved ${appt.id} to ${moved.start_datetime}.`);
      return { ok: true, start_datetime: moved.start_datetime };
    }
    case "handoff_to_human": {
      const a = i as z.infer<typeof Inputs.handoff_to_human>;
      ctx.progress("Handing over to a human…");
      await patchConversation(pool, convId, { needs_human: true, ai_enabled: false });
      bus.changed("conversations");
      await system(convId, `AI handed the chat to a human: ${a.reason}`);
      return { ok: true };
    }
  }
}
