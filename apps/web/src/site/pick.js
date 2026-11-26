// "Who it is for": the tabs swap a sample chat and the booking it creates.
// The first tab is already written in the HTML, so the page reads fine without this script.
// All conversations are illustrations, not real clients.
import { t } from "../i18n.js";
const SAMPLES = {
  barber: {
    biz: "Fade Lab",
    chan: "/ Telegram",
    chat: [
      ["in", "Hi! Can I get a haircut and beard trim tomorrow evening?"],
      ["out", "Hi! Tomorrow Dan is free at 17:30 and 19:00. A haircut with beard trim takes 60 min and costs $35."],
      ["in", "19:00 please"],
      ["out", "Booked: tomorrow 19:00 with Dan, $35. I will remind you the day before and 2 hours before."],
    ],
    rows: [
      ["Service", "Haircut and beard trim"],
      ["Specialist", "Dan"],
      ["When", "Tomorrow, 19:00"],
      ["Price", "$35"],
      ["Reminders", "24 h and 2 h before"],
      ["Source", "Telegram, booked by the AI"],
    ],
  },
  nails: {
    biz: "Glow Nails",
    chan: "/ Telegram",
    chat: [
      ["in", "Hi! Any time for a gel manicure on Friday?"],
      ["out", "Hi Lia! On Friday Maya is free at 11:00, 14:30 and 17:00. Which one suits you?"],
      ["in", "14:30 please"],
      ["out", "Booked: gel manicure, Friday 14:30 with Maya, $45. I will remind you the day before."],
    ],
    rows: [
      ["Service", "Gel manicure"],
      ["Specialist", "Maya"],
      ["When", "Friday, 14:30"],
      ["Price", "$45"],
      ["Reminders", "24 h and 2 h before"],
      ["Source", "Telegram, booked by the AI"],
    ],
  },
  clinic: {
    biz: "Smile Dental",
    chan: "/ Telegram",
    chat: [
      ["in", "Hello, can I book a teeth cleaning after 17:00?"],
      ["out", "Hello! Dr. Kim has Tuesday 17:30 and Thursday 18:15. Cleaning takes 45 minutes and costs $60. Which one suits you?"],
      ["in", "Thursday please"],
      ["out", "Booked: teeth cleaning, Thursday 18:15 with Dr. Kim, $60. I will remind you the day before."],
    ],
    rows: [
      ["Service", "Teeth cleaning"],
      ["Doctor", "Dr. Kim"],
      ["When", "Thursday, 18:15"],
      ["Price", "$60"],
      ["Reminders", "24 h and 2 h before"],
      ["Source", "Telegram, booked by the AI"],
    ],
  },
  studio: {
    biz: "Flow Studio",
    chan: "/ Telegram",
    chat: [
      ["in", "Is there a yoga class tomorrow morning?"],
      ["out", "Yes! Hatha yoga with Mira starts at 08:30 and 4 spots are left. Want me to hold one?"],
      ["in", "Yes, one spot"],
      ["out", "Booked: Hatha yoga, tomorrow 08:30 with Mira. I will remind you the evening before."],
    ],
    rows: [
      ["Class", "Hatha yoga"],
      ["Teacher", "Mira"],
      ["When", "Tomorrow, 08:30"],
      ["Price", "$12"],
      ["Reminders", "24 h and 2 h before"],
      ["Source", "Telegram, booked by the AI"],
    ],
  },
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = t(text);
  return node;
}

export function initPick() {
  const tabs = [...document.querySelectorAll("[data-tabs] [role=tab]")];
  const panel = document.getElementById("pick");
  if (!tabs.length || !panel) return;
  const biz = panel.querySelector('[data-p="biz"]');
  const chan = panel.querySelector('[data-p="chan"]');
  const chat = panel.querySelector('[data-p="chat"]');
  const rows = panel.querySelector('[data-p="rows"]');
  if (!biz || !chan || !chat || !rows) return;

  function show(tab, focus) {
    const sample = SAMPLES[tab.dataset.k];
    if (!sample) return;
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
    }
    panel.setAttribute("aria-labelledby", tab.id);
    biz.textContent = t(sample.biz);
    chan.textContent = t(sample.chan);
    chat.replaceChildren(
      ...sample.chat.map(([who, text]) => {
        const bubble = el("div", `bub ${who}`);
        if (who === "out") bubble.append(el("i", "", "AI"));
        bubble.append(t(text));
        return bubble;
      }),
    );
    rows.replaceChildren(
      ...sample.rows.map(([label, value]) => {
        const li = el("li");
        li.append(el("span", "", label), el("span", "", value));
        return li;
      }),
    );
    panel.classList.remove("swap");
    void panel.offsetWidth; // restart the little fade
    panel.classList.add("swap");
    if (focus) tab.focus();
  }

  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => show(tab));
    tab.addEventListener("keydown", (e) => {
      const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (to == null) return;
      e.preventDefault();
      show(tabs[(to + tabs.length) % tabs.length], true);
    });
  });
}
