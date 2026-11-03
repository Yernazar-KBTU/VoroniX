import { migrate, resetDatabase } from "./migrate.js";
import { pool } from "./pool.js";

// npm run db:reset: drops every business and the shared tables, then builds
// an empty database. Local development only.
(async () => {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to reset a production database.");
  await resetDatabase(pool);
  await migrate(pool, console.log);
  console.log("database reset: no businesses yet. Run npm run db:seed for the demo, or sign up in the app.");
})()
  .catch((e) => {
    console.error(e.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
