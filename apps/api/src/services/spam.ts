// Spam and nonsense detection for the sales funnel: a chat that keeps getting junk
// moves to the "Spam" stage instead of being deleted.

export type Junk = "spam" | "gibberish" | null;
type Msg = { from: string; text: string };

/** Junk messages of the client in a row (replies in between do not break the row) that move a chat to Spam. */
export const STREAK = 3;

const LINK = /(https?:\/\/|www\.|t\.me\/|bit\.ly\/)/i;
const PROMO = /выигра|казино|крипт|заработ|подписчик|раскрутк|накрутк|кредит|ставк|casino|crypto|giveaway|bonus|переходи по ссылке/gi;
const FREE = /бесплатн|free|iphone|айфон/i;
const MASH = /(\p{L})\1{3,}|asdf|qwer|zxcv|sdfg|dfgh|йцук|фыва|ячсм/iu;

/** What one message looks like: advertising, keyboard mashing or only symbols, or normal. */
export function junkKind(text: string): Junk {
  const t = text.trim();
  if (!t) return null;
  const promo = (t.match(PROMO) ?? []).length;
  if ((LINK.test(t) && (promo >= 1 || FREE.test(t))) || promo >= 2) return "spam";
  if (t.length > 40) return null;
  if (!/\p{L}/u.test(t) && !/\d/.test(t)) return "gibberish"; // only emoji and punctuation; digits can be an answer like "2"
  return MASH.test(t) ? "gibberish" : null;
}

/** Counts the client's junk messages from the end of the chat until a normal one. */
export function junkStreak(messages: Msg[]): { count: number; spam: boolean } {
  let count = 0;
  let spam = false;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].from !== "client") continue;
    const kind = junkKind(messages[i].text);
    if (!kind) break;
    count++;
    if (kind === "spam") spam = true;
  }
  return { count, spam };
}

export function isSpamChat(messages: Msg[]): boolean {
  const s = junkStreak(messages);
  return s.spam ? s.count >= 1 : s.count >= STREAK;
}

/** Only open chats of strangers are moved: a chat with a visit or a client card is a real client. */
export function shouldMoveToSpam(c: { stage: string; client_id?: string | null; appointment_id?: string | null; messages: Msg[] }): boolean {
  if (c.stage !== "New" && c.stage !== "In dialog") return false;
  if (c.client_id || c.appointment_id) return false;
  return isSpamChat(c.messages);
}
