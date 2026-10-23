import { redirect } from "next/navigation";
import { ADMIN_NAV, knownPermissions, type AdminLink } from "./access-catalog";
import { currentUser, type SessionUser } from "./auth";
import { getDb } from "./db";

export function userPermissions(userId: number) {
  const row = getDb()
    .prepare(
      `SELECT r.permissions_json AS json
       FROM users u JOIN access_roles r ON r.id = u.access_role_id
       WHERE u.id = ?`,
    )
    .get(userId) as { json: string } | undefined;
  if (!row) return [];
  try {
    const value = JSON.parse(row.json) as unknown;
    return Array.isArray(value) ? knownPermissions(value.filter((item) => typeof item === "string")) : [];
  } catch {
    return [];
  }
}

export function userCan(user: { id: number; role: string }, key: string, permissions = userPermissions(user.id)) {
  if (user.role === "super_admin") return true;
  if (user.role !== "staff") return false;
  return permissions.includes(key);
}

export function userCanAny(user: { id: number; role: string }, keys: string[], permissions = userPermissions(user.id)) {
  return keys.some((key) => userCan(user, key, permissions));
}

function linkAllowed(user: { id: number; role: string }, permission: string | string[], permissions: string[]) {
  return Array.isArray(permission) ? userCanAny(user, permission, permissions) : userCan(user, permission, permissions);
}

export function visibleAdminNav(user: { id: number; role: string }) {
  const permissions = user.role === "super_admin" ? [] : userPermissions(user.id);
  return ADMIN_NAV.map((group) => ({
    title: group.title,
    links: group.links.filter((link: AdminLink) => linkAllowed(user, link.permission, permissions)).map((link) => ({ label: link.label, href: link.href })),
  })).filter((group) => group.links.length > 0);
}

export async function requirePermission(key: string) {
  const user = await currentUser();
  if (!user || (user.role !== "super_admin" && user.role !== "staff")) redirect("/account/login");
  if (!userCan(user, key)) redirect("/admin/denied");
  return user;
}

export async function requireAnyPermission(keys: string[]) {
  const user = await currentUser();
  if (!user || (user.role !== "super_admin" && user.role !== "staff")) redirect("/account/login");
  if (!userCanAny(user, keys)) redirect("/admin/denied");
  return user as SessionUser;
}
