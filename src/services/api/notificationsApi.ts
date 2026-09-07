import { API_BASE } from "./client";

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
