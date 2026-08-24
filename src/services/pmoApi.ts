export type MachineRecord = {
  no: number;
  kode_mesin: string;
  nama_mesin: string;
  lokasi: string | null;
  departemen: string | null;
  kategori: "MTC" | "UTY" | "BLD";
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
    headers: { "Content-Type": "application/json" },
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
    headers: { "Content-Type": "application/json" },
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
    headers: { "Content-Type": "application/json" },
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.message || "Failed to update machine parameter");
  }
  return response.json();
}

export async function deleteMachineParameter(id: number) {
  const response = await fetch(`${API_BASE}/api/machine-parameters/${id}`, { method: "DELETE" });
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
    headers: {
      "Content-Type": "application/json",
    },
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
) {
  const response = await fetch(`${API_BASE}/api/schedules/${id}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status, current_role: currentRole, ...fields }),
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
    headers: { "Content-Type": "application/json" },
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
  payload: Partial<Pick<ApprovedOrderRecord, "preventive_date" | "execution_date" | "start_clock" | "end_clock" | "technician_name" | "status">>,
) {
  const response = await fetch(`${API_BASE}/api/approved-orders/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
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
  });

  if (!response.ok) {
    throw new Error("Failed to delete schedule plan");
  }

  return response.json();
}
