// Who may do what. Pure data and functions (no Express, no database), so it is easy to test.

export type Role = "owner" | "admin" | "accountant" | "master" | "staff";

const ALL_PERMISSIONS = [
  "clients:read",
  "clients:write",
  "appointments:read", // all visits
  "appointments:own", // only the visits of the master's own barber card
  "appointments:write",
  "payments:read",
  "payments:pay", // mark paid, take a full payment
  "payments:refund",
  "knowledge:read",
  "knowledge:write",
  "reports:read",
  "import:manage",
  "integrations:manage",
  "sql:console",
  "users:manage",
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

const FRONT_DESK: readonly Permission[] = [
  "clients:read",
  "clients:write",
  "appointments:read",
  "appointments:write",
  "payments:read",
  "payments:pay",
  "knowledge:read",
  "knowledge:write",
  "reports:read",
  "import:manage",
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: ALL_PERMISSIONS,
  admin: FRONT_DESK,
  // 'staff' is the old role from before RBAC: it keeps the front-desk rights.
  staff: FRONT_DESK,
  accountant: ["payments:read", "payments:refund", "reports:read"],
  master: ["appointments:own"],
};

export function can(role: string | undefined, permission: Permission): boolean {
  if (!role) return false;
  const list = (ROLE_PERMISSIONS as Record<string, readonly Permission[] | undefined>)[role];
  return list ? list.includes(permission) : false;
}

/** A master sees only the visits of his own barber card; everybody else sees all rows. */
export function ownRowsOnly<T>(user: { role?: string; master_id?: string | null } | undefined, rows: T[]): T[] {
  if (user?.role !== "master") return rows;
  return rows.filter((r) => (r as { master_id?: string }).master_id === user.master_id);
}
