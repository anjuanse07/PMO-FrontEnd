import { getAuditSessionId, getCurrentUser } from "../auth/auth";

function auditHeaders(): Record<string, string> {
  const user = getCurrentUser();
  return {
    "Content-Type": "application/json",
    "X-Audit-Session-Id": getAuditSessionId(),
    ...(user ? { "X-Audit-User-Id": String(user.id) } : {}),
  };
}

// ------------------------------------------------------------------
export type MachineRecord = {
  no: number;
  kode_mesin: string;
  nama_mesin: string;
  lokasi: string | null;
  departemen: string | null;
  kategori: "MTC" | "UTY" | "BLD";
  sub_child: string | null; // NEW — e.g. "MTC 1", "UTY 2"; null until backfilled
};


export type TechnicianRecord = {
  technician_name: string;
  role: string;
  detail_technician_role: string;
  technician_main_sub: string;
  technician_child_sub: string;
};

export type ScheduleRecord = {
  id: number;
  machine_no: number;
  machine_asset?: string | null;
  machine_name?: string | null;
  department?: string | null;
  location?: string | null;
  technician_name?: string | null;
  execution_date?: string | null;
  start_clock?: string | null;
  end_clock?: string | null;
  draft_date?: string | null;
  approved_by_engineering_date?: string | null;
  approved_by_manager_date?: string | null;
  approved_by_engineering_user?: string | null;
  approved_by_manager_user?: string | null;
  sub: "MTC" | "UTY" | "BLD";
  tahun: number;
  bulan: number;
  minggu: number;
  tanggal_jadwal: string | null;
  preventive_types: string;
  status: "Draft" | "Approved by Engineering" | "Approved by Manager";
};

export type PreventiveTypeRecord = {
  id: number;
  abbreviation: string;
  parameter: string;
};

export type ApprovedOrderRecord = {
  id: number;
  machine_no: number;
  machine_asset: string;
  machine_name: string;
  location: string | null;
  department: string | null;
  sub: "MTC" | "UTY" | "BLD";
  year: number;
  month: number;
  week: number;
  preventive_types: string;
  preventive_date: string | null;
  execution_date: string | null;
  start_clock: string | null;
  end_clock: string | null;
  technician_name: string | null;
  status: "In Progress" | "Approval" | "Completed";
  approved_by_manager_date: string | null;
  approved_by_manager_user?: string | null;
  // Three-stage sign-off: Technician -> Machine User / PIC -> Engineering.
  // Engineering is the final stage; once set, the record is locked from further edits.
  approved_by_technician_date?: string | null;
  approved_by_technician_user?: string | null;
  approved_by_pic_date?: string | null;
  approved_by_pic_user?: string | null;
  approved_by_engineering_date?: string | null;
  approved_by_engineering_user?: string | null;
  created_at: string;
  updated_at: string;
};

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5000";

export type OrderResultRecord = {
  id: number;
  order_id: number;
  parameter_id: number;
  result: string | null;
  justification: string | null;
  part_master: string | null;
  part_checklist: string | null;
  action: string | null;
  standard: string | null;
  sort_order: number;
};

export async function fetchOrderResults(orderId: number): Promise<OrderResultRecord[]> {
  const response = await fetch(`${API_BASE}/api/approved-orders/${orderId}/results`);
  if (!response.ok) throw new Error("Failed to fetch order results");
  return response.json();
}

export async function saveOrderResults(
  orderId: number,
  items: Array<{ parameter_id: number; result: string | null; justification?: string | null }>,
) {
  const response = await fetch(`${API_BASE}/api/approved-orders/${orderId}/results`, {
    method: "PATCH",
    headers: auditHeaders(),
    body: JSON.stringify({ items }),
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.details || errorBody?.message || "Failed to save order results");
  }
  return response.json();
}

export type MachineParameterRecord = {
  id: number;
  machine_no: number;
  part_master: string;
  part_checklist: string;
  action: string | null;
  standard: string | null;
  sort_order: number;
  machine_name?: string;
  machine_asset?: string;
};

export async function fetchMachineParameters(): Promise<MachineParameterRecord[]> {
  const response = await fetch(`${API_BASE}/api/machine-parameters`);
  if (!response.ok) throw new Error("Failed to fetch machine parameters");
  return response.json();
}

export async function createMachineParameter(payload: {
  machine_no: number;
  part_master: string;
  part_checklist: string;
  action?: string | null;
  standard?: string | null;
  sort_order?: number;
}) {
  const response = await fetch(`${API_BASE}/api/machine-parameters`, {
    method: "POST",
    headers: auditHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.message || "Failed to create machine parameter");
  }
  return response.json();
}

export async function bulkCreateMachineParameters(
  items: Array<{
    machine_no: number;
    part_master: string;
    part_checklist: string;
    action?: string | null;
    standard?: string | null;
    sort_order?: number;
  }>,
) {
  const response = await fetch(`${API_BASE}/api/machine-parameters/bulk`, {
    method: "POST",
    headers: auditHeaders(),
    body: JSON.stringify({ items }),
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.message || "Failed to import machine parameters");
  }
  return response.json();
}

export async function updateMachineParameter(
  id: number,
  payload: Partial<{ part_master: string; part_checklist: string; action: string | null; standard: string | null; sort_order: number }>,
) {
  const response = await fetch(`${API_BASE}/api/machine-parameters/${id}`, {
    method: "PATCH",
    headers: auditHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.message || "Failed to update machine parameter");
  }
  return response.json();
}

export async function deleteMachineParameter(id: number) {
  const response = await fetch(`${API_BASE}/api/machine-parameters/${id}`, { method: "DELETE", headers: auditHeaders() });
  if (!response.ok) throw new Error("Failed to delete machine parameter");
  return response.json();
}

export async function fetchMachines(): Promise<MachineRecord[]> {
  const response = await fetch(`${API_BASE}/api/machines`);
  if (!response.ok) {
    throw new Error("Failed to fetch machine list");
  }

  return response.json();
}

export async function fetchTechnicians(): Promise<TechnicianRecord[]> {
  const response = await fetch(`${API_BASE}/api/technicians`);
  if (!response.ok) {
    throw new Error("Failed to fetch technicians list");
  }

  return response.json();
}

export async function fetchPreventiveTypes(): Promise<PreventiveTypeRecord[]> {
  const response = await fetch(`${API_BASE}/api/preventive-types`);
  if (!response.ok) {
    throw new Error("Failed to fetch preventive types");
  }

  return response.json();
}

export async function fetchSchedules(): Promise<ScheduleRecord[]> {
  const response = await fetch(`${API_BASE}/api/schedules`);
  if (!response.ok) {
    throw new Error("Failed to fetch schedules");
  }

  return response.json();
}

export async function createSchedulePlan(payload: {
  machine_no: number;
  machine_asset?: string;
  machine_name?: string;
  department?: string | null;
  location?: string | null;
  technician_name?: string | null;
  execution_date?: string | null;
  start_clock?: string | null;
  end_clock?: string | null;
  draft_date?: string | null;
  approved_by_engineering_date?: string | null;
  approved_by_manager_date?: string | null;
  sub: "MTC" | "UTY" | "BLD";
  tahun: number;
  bulan: number;
  minggu: number;
  tanggal_jadwal: string;
  preventive_types: string;
  status?: "Draft" | "Approved by Engineering" | "Approved by Manager";
  current_role?: string;
}) {
  const response = await fetch(`${API_BASE}/api/schedules`, {
    method: "POST",
    headers: auditHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.message || "Failed to save schedule plan");
  }

  return response.json();
}

export async function updateScheduleStatus(
  id: number,
  status: "Draft" | "Approved by Engineering" | "Approved by Manager",
  fields?: Partial<ScheduleRecord>,
  currentRole?: string,
  actorUserId?: number,
) {
  const response = await fetch(`${API_BASE}/api/schedules/${id}/status`, {
    method: "PATCH",
    headers: auditHeaders(),
    body: JSON.stringify({ status, current_role: currentRole, actor_user_id: actorUserId, ...fields }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.message || "Failed to update schedule status");
  }

  return response.json();
}

export async function fetchApprovedOrders(): Promise<ApprovedOrderRecord[]> {
  const response = await fetch(`${API_BASE}/api/approved-orders`);
  if (!response.ok) {
    throw new Error("Failed to fetch approved orders");
  }

  return response.json();
}

export async function createApprovedOrder(payload: Omit<ApprovedOrderRecord, "id" | "created_at" | "updated_at">) {
  const response = await fetch(`${API_BASE}/api/approved-orders`, {
    method: "POST",
    headers: auditHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.details || errorBody?.message || "Failed to save approved order");
  }

  return response.json();
}

export async function updateApprovedOrder(
  id: number,
  payload: Partial<
    Pick<
      ApprovedOrderRecord,
      | "machine_asset"
      | "preventive_date"
      | "execution_date"
      | "start_clock"
      | "end_clock"
      | "technician_name"
      | "status"
      | "approved_by_technician_date"
      | "approved_by_technician_user"
      | "approved_by_pic_date"
      | "approved_by_pic_user"
      | "approved_by_engineering_date"
      | "approved_by_engineering_user"
    >
  >,
) {
  const response = await fetch(`${API_BASE}/api/approved-orders/${id}`, {
    method: "PATCH",
    headers: auditHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.details || errorBody?.message || "Failed to update approved order");
  }

  return response.json();
}

export async function deleteSchedulePlan(id: number) {
  const response = await fetch(`${API_BASE}/api/schedules/${id}`, {
    method: "DELETE",
    headers: auditHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to delete schedule plan");
  }

  return response.json();
}

export type UpdateUserPayload = Partial<{
  name: string;
  nickname: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
}>;

export type UserRecord = {
  id: number;
  nickname: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  role: string;
};

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

export async function updateUser(id: number, payload: UpdateUserPayload): Promise<UserRecord> {
  const response = await fetch(`${API_BASE}/api/users/${id}`, {
    method: "PATCH",
    headers: auditHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.message || "Failed to update user profile");
  }

  const data = await response.json();
  return data.user as UserRecord;
}

// ------------------------------------------------------------------
// Notifications (header bell dropdown)
// ------------------------------------------------------------------

export type NotificationPendingItem = {
  id: string;
  title: string;
  link: string;
  severity: "warning" | "error";
};

export type NotificationActivityItem = {
  id: number;
  title: string;
  userName: string | null;
  createdAt: string;
  link: string | null;
};

export type NotificationsResponse = {
  pending: NotificationPendingItem[];
  activity: NotificationActivityItem[];
};

export async function fetchNotifications(
  userId: number,
  role: string,
  technician?: string,
): Promise<NotificationsResponse> {
  const params = new URLSearchParams({ user_id: String(userId), role });
  if (technician) params.set("technician", technician);
  const response = await fetch(`${API_BASE}/api/notifications?${params.toString()}`);
  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.message || "Failed to fetch notifications");
  }
  return response.json();
}

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

