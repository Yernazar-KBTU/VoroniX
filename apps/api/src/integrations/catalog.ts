/** The services the Integrations page offers, in the order it shows them. */
export interface Field {
  key: string;
  label: string;
  placeholder?: string;
  secret?: boolean;
  required?: boolean;
}

export interface Provider {
  id: "telegram" | "whatsapp" | "instagram" | "claude" | "kaspi" | "google_calendar" | "webhook";
  name: string;
  group: "Messengers" | "AI" | "Payments" | "Calendar" | "Automation";
  description: string;
  /** live: works as soon as it is connected; bridge: needs a step on the other side. */
  mode: "live" | "bridge";
  fields: Field[];
  steps: string[];
}

export const PROVIDERS: Provider[] = [
  {
    id: "telegram",
    name: "Telegram",
    group: "Messengers",
    description: "Clients write to your bot, the AI answers in the same chat.",
    mode: "live",
    fields: [{ key: "token", label: "Bot token", placeholder: "123456789:AA...", secret: true, required: true }],
    steps: ["Open @BotFather in Telegram and send /newbot.", "Copy the token it gives you and paste it here.", "Press Connect. Write to the bot to test it."],
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    group: "Messengers",
    description: "Messages from WhatsApp Business come into Chats.",
    mode: "bridge",
    fields: [{ key: "phone", label: "Business phone", placeholder: "Your WhatsApp Business number" }],
    steps: [
      "Connect your number to WhatsApp Business API (Meta, 360dialog or Wazzup).",
      "Set the incoming webhook to the address below and add the header x-channel-secret.",
      "Send {external_user_id, name, text} as JSON. Replies come back through the outgoing webhook.",
    ],
  },
  {
    id: "instagram",
    name: "Instagram",
    group: "Messengers",
    description: "Direct messages from your Instagram business account.",
    mode: "bridge",
    fields: [{ key: "account", label: "Instagram account", placeholder: "@yourbusiness" }],
    steps: [
      "Link the Instagram business account to a Facebook page in Meta Business Suite.",
      "In Make, n8n or your Meta app, forward new direct messages to the address below with the header x-channel-secret.",
      "Send {external_user_id, name, text} as JSON.",
    ],
  },
  {
    id: "claude",
    name: "Claude AI",
    group: "AI",
    description: "Claude writes the replies instead of the built-in rule engine.",
    mode: "live",
    fields: [{ key: "key", label: "Anthropic API key", placeholder: "sk-ant-...", secret: true, required: true }],
    steps: ["Create a key at console.anthropic.com → API keys.", "Paste it here and press Connect. The next reply is written by Claude."],
  },
  {
    id: "kaspi",
    name: "Kaspi Pay",
    group: "Payments",
    description: "Prepayment buttons in the chat lead to Kaspi QR.",
    mode: "bridge",
    fields: [
      { key: "merchant", label: "Merchant ID", placeholder: "from the Kaspi Pay cabinet", required: true },
      { key: "api_key", label: "API key", secret: true },
    ],
    steps: ["Sign the Kaspi Pay contract for online payments.", "Copy the merchant ID and API key from the Kaspi Pay cabinet.", "Until the contract is active, payment buttons work in test mode."],
  },
  {
    id: "google_calendar",
    name: "Google Calendar",
    group: "Calendar",
    description: "Every visit appears in the barbers' Google or Apple calendar.",
    mode: "live",
    fields: [],
    steps: ["Press Connect to get a private calendar address.", "Google Calendar → Other calendars → + → From URL, paste the address.", "Google refreshes it every few hours. Apple Calendar: File → New Calendar Subscription."],
  },
  {
    id: "webhook",
    name: "Webhook",
    group: "Automation",
    description: "Send new bookings and payments to Make, Zapier, n8n, 1C or Google Sheets.",
    mode: "live",
    fields: [
      { key: "url", label: "URL", placeholder: "https://hook.eu1.make.com/...", required: true },
      { key: "events", label: "Events (empty = all)", placeholder: "appointment.created, payment.paid" },
    ],
    steps: ["Create a webhook trigger in Make, Zapier or n8n and copy its URL.", "Paste it here and press Connect: a test event is sent at once.", "Each event is JSON {event, at, data}; the header x-voronix-secret proves it came from your CRM."],
  },
];
