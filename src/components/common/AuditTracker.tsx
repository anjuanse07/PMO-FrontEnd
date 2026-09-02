import { useEffect } from "react";
import { useLocation } from "react-router";
import { getAuditSessionId, getCurrentUser } from "../../auth/auth";

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) || "http://localhost:5000";

function recordActivity(pagePath: string) {
  const user = getCurrentUser();
  if (!user) return;

  void fetch(`${API_BASE_URL}/api/audit-events`, {
    method: "POST",
    keepalive: true,
    headers: {
      "Content-Type": "application/json",
      "X-Audit-Session-Id": getAuditSessionId(),
    },
    body: JSON.stringify({
      user_id: user.id,
      event_type: "PAGE_VIEW",
      page_path: pagePath,
    }),
  }).catch((error) => console.error("Activity audit failed:", error));
}

export default function AuditTracker() {
  const location = useLocation();

  useEffect(() => {
    const pagePath = `${location.pathname}${location.search}`;
    recordActivity(pagePath);
  }, [location.pathname, location.search]);

  return null;
}