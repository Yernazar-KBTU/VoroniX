import { describe, expect, it } from "vitest";
import { isSpamChat, junkKind, shouldMoveToSpam } from "../../src/services/spam.js";

const client = (text: string) => ({ from: "client", text });
const ai = (text: string) => ({ from: "ai", text });

describe("one message", () => {
  it("recognises advertising with a link", () => {
    expect(junkKind("ВЫИГРАЙ iPhone бесплатно!!! Переходи по ссылке http://example.com/win")).toBe("spam");
  });
  it("recognises advertising without a link", () => {
    expect(junkKind("Предлагаем раскрутку Instagram, 10000 подписчиков за 5000 тенге, пишите!")).toBe("spam");
  });
  it("recognises keyboard mashing and repeated letters", () => {
    expect(junkKind("asdfghjkl qwerty 12345 ыыыы")).toBe("gibberish");
    expect(junkKind("ыыыы аааа ффф")).toBe("gibberish");
  });
  it("recognises messages made only of emoji or a lone question mark", () => {
    expect(junkKind("😀😀😀🔥🔥")).toBe("gibberish");
    expect(junkKind("?")).toBe("gibberish");
  });
  it("leaves real messages alone", () => {
    expect(junkKind("Сколько стоит мужская стрижка?")).toBeNull();
    expect(junkKind("Запиши меня бесплатно")).toBeNull();
    expect(junkKind("2")).toBeNull();
    expect(junkKind("+7 700 000 0000")).toBeNull();
  });
});

describe("a chat", () => {
  it("is spam after three nonsense messages in a row, with replies in between", () => {
    expect(isSpamChat([client("ыыыы"), ai("Не понял"), client("аааа"), ai("Передал администратору"), client("ффф ыыыы")])).toBe(true);
  });
  it("is not spam after two", () => {
    expect(isSpamChat([client("ыыыы"), ai("Не понял"), client("аааа")])).toBe(false);
  });
  it("starts counting again after a normal message", () => {
    expect(isSpamChat([client("ыыыы"), client("аааа"), client("Сколько стоит стрижка?"), client("ыыыы")])).toBe(false);
  });
  it("is spam at once for advertising", () => {
    expect(isSpamChat([client("Предлагаем раскрутку Instagram, 10000 подписчиков")])).toBe(true);
  });
});

describe("which chats are moved", () => {
  const junk = [client("ыыыы"), client("аааа"), client("ффф ыыыы")];
  it("moves an open chat of a stranger", () => {
    expect(shouldMoveToSpam({ stage: "In dialog", client_id: null, appointment_id: null, messages: junk })).toBe(true);
  });
  it("does not move a booked or paid chat", () => {
    expect(shouldMoveToSpam({ stage: "Booked", client_id: null, appointment_id: null, messages: junk })).toBe(false);
    expect(shouldMoveToSpam({ stage: "Paid", client_id: null, appointment_id: null, messages: junk })).toBe(false);
  });
  it("does not move a chat of a known client", () => {
    expect(shouldMoveToSpam({ stage: "In dialog", client_id: "CL-0001", appointment_id: null, messages: junk })).toBe(false);
  });
});
