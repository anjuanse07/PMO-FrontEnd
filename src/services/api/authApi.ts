import { API_BASE, auditHeaders } from "./client";

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
