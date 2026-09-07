import { API_BASE, auditHeaders } from "./client";

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
  inisial: string | null;
  role: string;
  detail_technician_role: string;
  technician_main_sub: string;
  technician_child_sub: string;
};

export type PreventiveTypeRecord = {
  id: number;
  abbreviation: string;
  parameter: string;
};

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
