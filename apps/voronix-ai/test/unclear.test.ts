// Messages the AI administrator cannot read: it says so honestly, hands the
// chat to a manager on the second one in a row, and a lone "?" is not "yes".
// The reply follows the language of the message, so each check accepts the
// Russian, Kazakh and English text.
import { describe, expect, it } from "vitest";
import { augment, loadExamples } from "../src/data.js";
import { IntentModel } from "../src/model.js";
import { SETTINGS } from "../src/live/learner.js";
import { Live } from "../src/live/runtime.js";
import { MemoryStore } from "../src/live/store.js";

const seed = loadExamples();
const start = IntentModel.train(augment(seed), SETTINGS);
const NOW = new Date(2026, 10, 5, 12, 0);
const now = () => new Date(NOW);

async function open() {
  const live = new Live(new MemoryStore(), seed, now, start);
  await live.start();
  return live;
}
const say = (live: Live, name: string, text: string) => live.receive({ name, channel: "telegram", text });

const GIBBERISH = "asdfghjkl qwerty 12345 ыыыы";
const NOT_UNDERSTOOD = /Не совсем понял|толық түсінбедім|didn't quite understand/;
const HANDED_OVER = /передал диалог администратору|Диалогты әкімшіге бердім|passed the chat to the manager/;
const GOOD_QUESTION = /Хороший вопрос|Жақсы сұрақ|Good question/;

describe("messages the AI cannot read", () => {
  it("says honestly that it did not understand, and does not pretend it was a good question", async () => {
    const live = await open();
    const r = await say(live, "Aliya", GIBBERISH);
    expect(r.outcome.reply).toMatch(NOT_UNDERSTOOD);
    expect(r.outcome.reply).not.toMatch(GOOD_QUESTION);
    expect(r.outcome.actions.some((a) => a.type === "unknown")).toBe(true);
  });

  it("hands the chat to a manager on the second unclear message in a row", async () => {
    const live = await open();
    await say(live, "Dias", GIBBERISH);
    const second = await say(live, "Dias", GIBBERISH);
    expect(second.outcome.reply).toMatch(HANDED_OVER);
    expect(second.outcome.actions.some((a) => a.type === "handoff")).toBe(true);
  });

  it("starts counting again after a message it understood", async () => {
    const live = await open();
    await say(live, "Arman", GIBBERISH);
    const price = await say(live, "Arman", "Сколько стоит мужская стрижка?");
    expect(price.outcome.reply).toMatch(/7 000/);
    const again = await say(live, "Arman", GIBBERISH);
    expect(again.outcome.reply).toMatch(NOT_UNDERSTOOD);
    expect(again.outcome.actions.some((a) => a.type === "handoff")).toBe(false);
  });

  it("does not take a lone question mark for agreement", async () => {
    const live = await open();
    const r = await say(live, "Madi", "?");
    expect(r.outcome.reply).not.toBe("Хорошо!");
    expect(r.outcome.reply).not.toBe("Great!");
    expect(r.outcome.booking).toBeUndefined();
  });
});
