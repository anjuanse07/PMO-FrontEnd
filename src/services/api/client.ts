import { getAuditSessionId, getCurrentUser } from "../../auth/auth";

export function auditHeaders(): Record<string, string> {
  const user = getCurrentUser();
  return {
    "Content-Type": "application/json",
    "X-Audit-Session-Id": getAuditSessionId(),
    ...(user ? { "X-Audit-User-Id": String(user.id) } : {}),
  };
}

export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5000";
