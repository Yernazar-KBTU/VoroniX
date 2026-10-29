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

/** "25 000 ₸" */
export const money = (n: number) => `${Math.round(n).toLocaleString("ru-RU").replace(/\s/g, " ")} ₸`;
