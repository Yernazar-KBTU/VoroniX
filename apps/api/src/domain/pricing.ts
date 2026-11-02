import { currentTenant } from "../tenancy/context.js";
import type { BusinessSettings, Service } from "./types.js";

/**
 * Prepayment for a service under the business rule from the Task 9 report:
 * services priced at or above prepay_min_price need prepay_percent upfront.
 * Returns 0 when no prepayment is needed.
 */
export function prepaymentFor(service: Pick<Service, "price_kzt">, biz: Pick<BusinessSettings, "prepay_percent" | "prepay_min_price">): number {
  if (!biz.prepay_percent || service.price_kzt < biz.prepay_min_price) return 0;
  return Math.round((service.price_kzt * biz.prepay_percent) / 100);
}

const formats = new Map<string, Intl.NumberFormat>();

/**
 * A price in the currency of the current business: "25 000 ₸", "$45", "€30".
 * Prices are whole units of that currency.
 */
export function money(n: number, currency = currentTenant()?.currency ?? "KZT"): string {
  if (currency === "KZT") return `${Math.round(n).toLocaleString("ru-RU").replace(/\s/g, " ")} ₸`;
  let f = formats.get(currency);
  if (!f) {
    f = new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "narrowSymbol", minimumFractionDigits: 0, maximumFractionDigits: 0 });
    formats.set(currency, f);
  }
  return f.format(Math.round(n));
}
