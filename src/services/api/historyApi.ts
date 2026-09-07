import { API_BASE, auditHeaders } from "./client";

// ------------------------------------------------------------------
// History Log
// ------------------------------------------------------------------

export type HistoryLogStatus = "In Progress" | "Approval" | "Completed";

export type HistoryLogRecord = {
  id: number;
  machine_no: number;
  machine_asset: string;
  machine_name: string;
  location: string | null;
  department: string | null;
  main_sub: "MTC" | "UTY" | "BLD";
  sub_child: string | null;
  preventive_types: string;
  preventive_date: string | null;
  execution_date: string | null;
  start_clock: string | null;
  end_clock: string | null;
  technician_name: string | null;
  status: HistoryLogStatus;
  approved_by_manager_date: string | null;
  approved_by_manager_user: string | null;
  created_at: string;
  updated_at: string;
};

export type HistoryLogFilters = {
  role?: string; // required by the backend — only manager / engineering supervisor may view
  search?: string;
  mainSub?: string;
  childSub?: string;
  machineNo?: string;
  machineName?: string;
  machineId?: string;
  technician?: string;
  status?: string;
  startAt?: string;
  endAt?: string;
};

function buildHistoryLogParams(filters: HistoryLogFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.role) params.set("role", filters.role);
  if (filters.search) params.set("search", filters.search);
  if (filters.mainSub) params.set("main_sub", filters.mainSub);
  if (filters.childSub) params.set("child_sub", filters.childSub);
  if (filters.machineNo) params.set("machine_no", filters.machineNo);
  if (filters.machineName) params.set("machine_name", filters.machineName);
  if (filters.machineId) params.set("machine_id", filters.machineId);
  if (filters.technician) params.set("technician", filters.technician);
  if (filters.status) params.set("status", filters.status);
  if (filters.startAt) params.set("start_at", filters.startAt);
  if (filters.endAt) params.set("end_at", filters.endAt);
  return params;
}

export async function fetchHistoryLogs(filters: HistoryLogFilters = {}): Promise<HistoryLogRecord[]> {
  const params = buildHistoryLogParams(filters);
  const response = await fetch(`${API_BASE}/api/history-logs?${params.toString()}`);
  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.message || "Failed to fetch history logs");
  }
  return response.json();
}

export async function exportHistoryLogs(userId: number, filters: HistoryLogFilters = {}): Promise<Blob> {
  const params = buildHistoryLogParams(filters);
  params.set("user_id", String(userId));
  const response = await fetch(`${API_BASE}/api/history-logs/export?${params.toString()}`);
  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.message || "Failed to export history logs");
  }
  return response.blob();
}

export type HistoryLogImportItem = {
  machine_asset: string; // kode_mesin — used to match the machine
  preventive_types: string;
  execution_date: string; // "YYYY-MM-DD"
  technician_name?: string | null;
  start_clock?: string | null;
  end_clock?: string | null;
  status?: HistoryLogStatus;
};

export async function importHistoryLogs(
  items: HistoryLogImportItem[],
  role?: string,
): Promise<{ success: boolean; inserted: number; skipped: string[] }> {
  const response = await fetch(`${API_BASE}/api/history-logs/import`, {
    method: "POST",
    headers: auditHeaders(),
    body: JSON.stringify({ items, role }),
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.message || "Failed to import history logs");
  }
  return response.json();
}
