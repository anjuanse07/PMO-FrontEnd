import { API_BASE, auditHeaders } from "./client";

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

export async function fetchApprovedOrders(year?: number): Promise<ApprovedOrderRecord[]> {
  const params = new URLSearchParams();
  if (year) params.set("year", String(year));
  const query = params.toString();
  const response = await fetch(`${API_BASE}/api/approved-orders${query ? `?${query}` : ""}`);
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
