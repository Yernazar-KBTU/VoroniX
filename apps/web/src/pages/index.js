import { dashboard } from "./dashboard.js";
import { inbox } from "./inbox.js";
import { business, database, analytics } from "./insights.js";
import { knowledge } from "./knowledge.js";
import { clients, payments, services, staff } from "./lists.js";
import { calendar, pipeline } from "./schedule.js";

/** Route name -> page { head(), body(), after?() } */
export const PAGES = { dashboard, inbox, pipeline, calendar, clients, services, staff, payments, knowledge, analytics, database, business };
