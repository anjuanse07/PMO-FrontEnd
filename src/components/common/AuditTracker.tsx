import { useEffect } from "react";
import { useLocation } from "react-router";
import { getAuditSessionId, getCurrentUser } from "../../auth/auth";

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) || "http://localhost:5000";

function recordActivity(eventType: "PAGE_VIEW" | "CLICK", pagePath: string, actionLabel?: string) {
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
      event_type: eventType,
      page_path: pagePath,
      action_label: actionLabel,
    }),
  }).catch((error) => console.error("Activity audit failed:", error));
}

export default function AuditTracker() {
  const location = useLocation();

  useEffect(() => {
    const pagePath = `${location.pathname}${location.search}`;
    recordActivity("PAGE_VIEW", pagePath);

    const handleClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("button, a") : null;
      if (!target) return;

      const actionLabel = (target.getAttribute("aria-label") || target.textContent || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 255);
      if (actionLabel) recordActivity("CLICK", pagePath, actionLabel);
    };

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [location.pathname, location.search]);

  return null;
}