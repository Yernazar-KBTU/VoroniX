# VoroniX Meta bridge (WhatsApp + Instagram)

A small standalone service. It receives messages from **WhatsApp Cloud API** and **Instagram Direct**,
passes them to VoroniX (`POST /api/channels/:business/:messenger/inbound`, header `x-channel-secret`)
and sends the AI's answer back to the client. No dependencies, Node 20+.

```
Client in WhatsApp / Instagram -> Meta -> /webhook (this bridge) -> VoroniX AI (CRM data only)
Client <- Meta <- bridge <- AI answer
```

Safety: every request is checked with `X-Hub-Signature-256`; Meta retries are deduplicated;
non-text messages get a polite fallback; one bridge serves many businesses via `BUSINESS_MAP`.

## Run

```bash
cd apps/meta-bridge
cp .env.example .env        # fill in the values
node --env-file=.env src/server.mjs
npm test                    # 7 unit tests
```

Docker: `docker build -t voronix-meta-bridge apps/meta-bridge`.
Render: add a second Web Service with root directory `apps/meta-bridge`, start command `node src/server.mjs`,
and the variables from `.env.example`. Meta needs a public **https** address.

## Connect WhatsApp

1. [developers.facebook.com](https://developers.facebook.com) > Create App > type Business > add **WhatsApp**.
2. WhatsApp > API Setup: copy the **Phone number ID** and a token. The temporary token lasts 24 h;
   for real use create a **System User** token in Business Settings with `whatsapp_business_messaging`.
3. WhatsApp > Configuration > Webhook: callback `https://<bridge>/webhook`, verify token = `META_VERIFY_TOKEN`,
   subscribe to **messages**.
4. Add `whatsapp:<Phone number ID>` to `BUSINESS_MAP`.

## Connect Instagram

1. The account must be Instagram **Business or Creator** and linked to a Facebook Page.
2. In the same Meta app add **Instagram** (Messenger API for Instagram), connect the account, generate a token.
3. Webhooks > object **Instagram**: callback `https://<bridge>/webhook`, same verify token, subscribe to **messages**.
4. Add `instagram:<Instagram account ID>` to `BUSINESS_MAP`.
5. Live mode needs Meta App Review for `instagram_manage_messages`. Before that only app roles (testers) can write.

## Meta limits to know

- WhatsApp: free-text replies are allowed within **24 hours** after the client's last message. Later messages need approved templates (reminders, mailings).
- Instagram: the same 24-hour window; text up to 1000 characters (the bridge splits longer answers).
- WhatsApp test number: only up to 5 verified recipients.

## If VoroniX expects other field names

Only two functions know the contract: `buildInboundPayload` (what is sent to VoroniX) and `extractReply`
(where the answer is read from) in `src/lib.mjs`. Change them to match `apps/api/src/routes` and the tests stay green.
