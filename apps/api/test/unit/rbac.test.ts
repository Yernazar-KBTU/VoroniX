import { describe, expect, it } from "vitest";
import { can, ownRowsOnly } from "../../src/auth/rbac-policy.js";

describe("roles (RBAC)", () => {
  it("the owner can do everything", () => {
    for (const p of ["clients:read", "payments:refund", "integrations:manage", "sql:console", "users:manage"] as const) {
      expect(can("owner", p)).toBe(true);
    }
  });

  it("the administrator works with clients and takes payments, but cannot refund or change settings", () => {
    expect(can("admin", "clients:write")).toBe(true);
    expect(can("admin", "payments:pay")).toBe(true);
    expect(can("admin", "payments:refund")).toBe(false);
    expect(can("admin", "integrations:manage")).toBe(false);
    expect(can("admin", "sql:console")).toBe(false);
  });

  it("the accountant refunds and reads payments, but sees no clients and takes no payments", () => {
    expect(can("accountant", "payments:read")).toBe(true);
    expect(can("accountant", "payments:refund")).toBe(true);
    expect(can("accountant", "payments:pay")).toBe(false);
    expect(can("accountant", "clients:read")).toBe(false);
    expect(can("accountant", "appointments:read")).toBe(false);
  });

  it("the master only has the right to his own visits", () => {
    expect(can("master", "appointments:own")).toBe(true);
    expect(can("master", "appointments:read")).toBe(false);
    expect(can("master", "payments:read")).toBe(false);
    expect(can("master", "clients:read")).toBe(false);
  });

  it("the old 'staff' role keeps the front-desk rights, an unknown role gets nothing", () => {
    expect(can("staff", "clients:read")).toBe(true);
    expect(can("staff", "payments:refund")).toBe(false);
    expect(can("hacker", "clients:read")).toBe(false);
    expect(can(undefined, "clients:read")).toBe(false);
  });

  it("a master sees only the rows of his barber card, everybody else sees all", () => {
    const rows = [{ id: "AP-1", master_id: "MS-01" }, { id: "AP-2", master_id: "MS-02" }];
    expect(ownRowsOnly({ role: "master", master_id: "MS-01" }, rows)).toEqual([rows[0]]);
    expect(ownRowsOnly({ role: "admin" }, rows)).toEqual(rows);
    expect(ownRowsOnly(undefined, rows)).toEqual(rows);
  });
});
