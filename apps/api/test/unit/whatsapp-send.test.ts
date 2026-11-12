import { describe, expect, it, vi } from "vitest";
import type { BusEvent } from "../../src/realtime/bus.js";
import { sendWhatsAppText, whatsappForwarder } from "../../src/channels/whatsapp.js";

const cfg = { accessToken: "TOKEN123", phoneNumberId: "9988" };

const message = (messenger: string, external_user_id: string, text: string) =>
  ({ type: "message", tenant: "t1", messenger, external_user_id, text }) as unknown as BusEvent;

describe("sendWhatsAppText", () => {
  it("posts the text to the Cloud API with the right number and token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const ok = await sendWhatsAppText(cfg, "77011234567", "Борода стоит 5 000 тенге", fetchMock as unknown as typeof fetch);

    expect(ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://graph.facebook.com/v21.0/9988/messages");
    expect(init.headers.Authorization).toBe("Bearer TOKEN123");
    expect(JSON.parse(init.body)).toEqual({
      messaging_product: "whatsapp",
      to: "77011234567",
      type: "text",
      text: { body: "Борода стоит 5 000 тенге" },
    });
  });

  it("reports false when Meta refuses", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    expect(await sendWhatsAppText(cfg, "77011234567", "hi", fetchMock as unknown as typeof fetch)).toBe(false);
  });
});

describe("whatsappForwarder", () => {
  it("sends a reply of a WhatsApp chat to the client's number", async () => {
    const send = vi.fn().mockResolvedValue(true);
    await whatsappForwarder(cfg, send)(message("WhatsApp", "wa_77011234567", "Завтра в 15:00 свободно"));
    expect(send).toHaveBeenCalledWith(cfg, "77011234567", "Завтра в 15:00 свободно");
  });

  it("does not send messages of other messengers", async () => {
    const send = vi.fn();
    await whatsappForwarder(cfg, send)(message("Telegram", "tg_123", "hi"));
    expect(send).not.toHaveBeenCalled();
  });

  it("ignores events that are not messages", async () => {
    const send = vi.fn();
    await whatsappForwarder(cfg, send)({ type: "changed", tenant: "t1", what: "clients" } as unknown as BusEvent);
    expect(send).not.toHaveBeenCalled();
  });

  it("skips WhatsApp chats that did not come through Meta", async () => {
    const send = vi.fn();
    await whatsappForwarder(cfg, send)(message("WhatsApp", "dias_test", "hi"));
    expect(send).not.toHaveBeenCalled();
  });

  it("does not crash the server when sending throws", async () => {
    const send = vi.fn().mockRejectedValue(new Error("network down"));
    await expect(whatsappForwarder(cfg, send)(message("WhatsApp", "wa_77011234567", "hi"))).resolves.toBeUndefined();
  });
});