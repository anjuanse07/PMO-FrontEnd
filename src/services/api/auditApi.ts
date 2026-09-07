import { API_BASE } from "./client";

export type AuditLogRecord = {
  id: number;
  user_id: number | null;
  nickname: string | null;
  user_name: string | null;
  user_role: string | null;
  session_id: string | null;
  event_type: string;
  entity_type: string | null;
  entity_id: string | null;
  page_path: string | null;
  action_label: string | null;
  metadata: unknown;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

export type AuditLogPage = {
  rows: AuditLogRecord[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type AuditLogFilters = {
  page: number;
  search: string;
  activity: string;
  startAt: string;
  endAt: string;
};

function toAuditDateTime(value: string): string | null {
  return value ? `${value.replace("T", " ")}:00` : null;
}

export async function fetchAuditLogs(role: string, filters: AuditLogFilters): Promise<AuditLogPage> {
  const params = new URLSearchParams({ role, page: String(filters.page) });
  if (filters.search) params.set("search", filters.search);
  if (filters.activity) params.set("activity", filters.activity);
  const startAt = toAuditDateTime(filters.startAt);
  const endAt = toAuditDateTime(filters.endAt);
  if (startAt) params.set("start_at", startAt);
  if (endAt) params.set("end_at", endAt);
  const response = await fetch(`${API_BASE}/api/audit-logs?${params}`);
  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.message || "Failed to fetch audit logs");
  }
  return response.json();
}

export async function exportAuditLogs(
  role: string,
  userId: number,
  filters: Pick<AuditLogFilters, "activity" | "startAt" | "endAt">,
): Promise<Blob> {
  const params = new URLSearchParams({ role, user_id: String(userId) });
  if (filters.activity) params.set("activity", filters.activity);
  const startAt = toAuditDateTime(filters.startAt);
  const endAt = toAuditDateTime(filters.endAt);
  if (startAt) params.set("start_at", startAt);
  if (endAt) params.set("end_at", endAt);
  const response = await fetch(`${API_BASE}/api/audit-logs/export?${params}`);
  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.message || "Failed to export audit logs");
  }
  return response.blob();
}

export async function exportAuditLogsPdf(
  role: string,
  userId: number,
  filters: Pick<AuditLogFilters, "activity" | "startAt" | "endAt">,
): Promise<AuditLogRecord[]> {
  const params = new URLSearchParams({ role, user_id: String(userId), format: "pdf" });
  if (filters.activity) params.set("activity", filters.activity);
  const startAt = toAuditDateTime(filters.startAt);
  const endAt = toAuditDateTime(filters.endAt);
  if (startAt) params.set("start_at", startAt);
  if (endAt) params.set("end_at", endAt);
  const response = await fetch(`${API_BASE}/api/audit-logs/export?${params}`);
  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.message || "Failed to export audit logs");
  }
  return response.json();
}
