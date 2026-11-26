# Localization

The web app uses one shared language preference and catalog in src/i18n.js.
The switcher is available on the public site, sign-in screens, and CRM header.
The selection is stored in localStorage as en, ru, or kk and survives
navigation and reloads. kk is the standard language code for Kazakh; the
switcher displays it as KZ for clarity.

## Adding interface copy

Keep English as the source string and add the same string to both RU and
KK in src/i18n.js. Use t("English source copy") for dynamic strings such as
greetings, headings, and dates. The CRM applies catalog entries to exact UI
text in rendered pages and skips chat message bodies. Do not translate arbitrary
CRM records or business-entered values; those belong to the business and must
stay as entered.

Keep punctuation, capitalization, placeholders, and meaning aligned in each
catalog. Use the same translation for repeated interface terms throughout the
CRM, and add translations for accessible labels and placeholders alongside
visible labels.

The catalogs cover the public landing page, sign-in flow, shared navigation,
and interface copy across the CRM pages. The Terms and Privacy page bodies keep
their published English legal wording; their navigation and page titles follow
the selected language. Add page-specific copy to the same catalogs as each
page is localized; missing entries intentionally fall back to English.
