import { integrationEncryptionConfigFrom } from "./encryption.js";
import { rotateIntegrationSecrets } from "../repositories/integrations.repo.js";
import { pool } from "../db/pool.js";
import { listTenants } from "../tenancy/tenants.js";
import { withTenant } from "../tenancy/context.js";

async function main() {
  let failed = false;
  try {
    const keyConfig = integrationEncryptionConfigFrom(process.env);
    if (!keyConfig.keys.has(keyConfig.activeKeyId)) {
      throw new Error("Configure an active integration encryption key before starting rotation");
    }

    for (const tenant of await listTenants(pool)) {
      try {
        const result = await withTenant(tenant, () => rotateIntegrationSecrets(pool));
        console.log(`${tenant.id}: scanned ${result.scanned}, rotated ${result.rotated}, already current ${result.unchanged}, changed concurrently ${result.changedDuringRotation}`);
        if (result.changedDuringRotation) failed = true;
      } catch (err) {
        failed = true;
        console.error(`${tenant.id}: rotation failed: ${(err as Error).message}`);
      }
    }
  } catch (err) {
    failed = true;
    console.error(`Key rotation failed: ${(err as Error).message}`);
  } finally {
    await pool.end();
  }

  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`Key rotation failed: ${(err as Error).message}`);
  process.exitCode = 1;
});
