import { API_BASE, auditHeaders } from "./client";

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

export async function fetchSchedules(year?: number): Promise<ScheduleRecord[]> {
  const params = new URLSearchParams();
  if (year) params.set("year", String(year));
  const query = params.toString();
  const response = await fetch(`${API_BASE}/api/schedules${query ? `?${query}` : ""}`);
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
