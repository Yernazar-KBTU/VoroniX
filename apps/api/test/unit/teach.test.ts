import { describe, expect, it } from "vitest";
import { promoFor } from "../../src/ai/offline-agent.js";
import { offlineOrganise } from "../../src/ai/teach.js";

describe("offlineOrganise (Teach the AI without Claude)", () => {
  const notes = `До конца ноября скидка 15% на маникюр по будням до 14:00. Опоздание больше 15 минут — запись переносится.
Наш слоган: «Красота начинается с заботы».
Часы работы: пн–вс 10:00–21:00.
Можно ли прийти с ребёнком? Да, в зоне ожидания есть игрушки.`;
  const d = offlineOrganise(notes);

  it("puts the slogan and new hours into settings, not into the knowledge base", () => {
    expect(d.settings).toEqual({ catchphrase: "Красота начинается с заботы", hours: "пн–вс 10:00–21:00" });
  });

  it("makes one entry per fact with a category", () => {
    expect(d.entries.map((e) => e.category)).toEqual(["Promotions", "Rules", "FAQ", "General"]);
    expect(d.entries[0].content).toBe("До конца ноября скидка 15% на маникюр по будням до 14:00.");
  });

  it("keeps numbers exactly and invents nothing", () => {
    const all = d.entries.map((e) => e.content).join(" ");
    expect(all).toContain("15%");
    expect(all).not.toMatch(/20%|бесплатно/);
  });
});

describe("promoFor", () => {
  const knowledge = [
    { id: "KB-1", title: "Акции", category: "Promotions", content: "Скидка 15% на маникюр по будням до 14:00. Другие скидки обещать нельзя.", updated_at: "" },
    { id: "KB-2", title: "Парковка", category: "FAQ", content: "Бесплатная парковка во дворе.", updated_at: "" },
  ];
  it("finds the promotion sentence that names the service", () => {
    expect(promoFor({ name: "Маникюр с гель-лаком" }, { knowledge })).toBe("Скидка 15% на маникюр по будням до 14:00.");
  });
  it("returns nothing for a service without a promotion", () => {
    expect(promoFor({ name: "Педикюр" }, { knowledge })).toBe("");
  });
});
