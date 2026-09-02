import { useEffect, useState } from "react";
import { getCurrentUser, isManager } from "../auth/auth";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";
import { exportAuditLogs, exportAuditLogsPdf, fetchAuditLogs, type AuditLogRecord } from "../services/pmoApi";

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "medium",
});

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateTimeFormatter.format(date);
}

function accountName(entry: AuditLogRecord) {
  return entry.user_name || entry.nickname || (entry.user_id ? `User #${entry.user_id}` : "System");
}

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "-").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  }[character] || character));
}

export default function AuditLogs() {
  const currentUser = getCurrentUser();
  const currentUserRole = currentUser?.role;
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [activity, setActivity] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (currentUserRole !== "manager") {
      setIsLoading(false);
      return;
    }

    const loadInitialLogs = async () => {
      setIsLoading(true);
      setError("");
      try {
        const result = await fetchAuditLogs(currentUserRole, { page, search, activity, startAt, endAt });
        setLogs(result.rows);
        setTotal(result.total);
        setTotalPages(result.totalPages);
        if (result.page !== page) setPage(result.page);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "Failed to fetch audit logs");
      } finally {
        setIsLoading(false);
      }
    };

    void loadInitialLogs();
  }, [activity, currentUserRole, endAt, page, refreshKey, search, startAt]);

  const exportLogs = async () => {
    if (!currentUser || !isManager(currentUser)) return;
    if (startAt && endAt && startAt > endAt) {
      setError("The end date and time must be after the start date and time.");
      return;
    }

    setIsExporting(true);
    setError("");
    try {
      const file = await exportAuditLogs(currentUser.role, currentUser.id, { activity, startAt, endAt });
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = "pmo-audit-logs.csv";
      link.click();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to export audit logs");
    } finally {
      setIsExporting(false);
    }
  };

  const exportPdf = async () => {
    if (!currentUser || !isManager(currentUser)) return;
    if (startAt && endAt && startAt > endAt) {
      setError("The end date and time must be after the start date and time.");
      return;
    }

    const reportWindow = window.open("", "_blank");
    if (!reportWindow) {
      setError("Allow pop-ups in your browser to export the PDF report.");
      return;
    }

    setIsExporting(true);
    setError("");
    try {
      const exportRows = await exportAuditLogsPdf(currentUser.role, currentUser.id, { activity, startAt, endAt });
      const rows = exportRows.map((entry) => `
        <tr>
          <td>${escapeHtml(formatDateTime(entry.created_at))}</td>
          <td>${escapeHtml(accountName(entry))}</td>
          <td>${escapeHtml(entry.event_type)}</td>
          <td>${escapeHtml(entry.action_label || entry.page_path || entry.entity_type)}</td>
          <td>${escapeHtml(entry.ip_address)}</td>
          <td>${escapeHtml(entry.user_agent)}</td>
        </tr>`).join("");
      reportWindow.document.write(`<!doctype html>
        <html><head><title>PMO Audit Logs</title><style>
          @page { size: landscape; margin: 12mm; }
          body { color: #172033; font: 10px Arial, sans-serif; }
          h1 { font-size: 18px; margin: 0 0 4px; }
          p { color: #53627a; margin: 0 0 16px; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #cbd5e1; padding: 6px; text-align: left; vertical-align: top; word-break: break-word; }
          th { background: #eaf1ff; font-weight: 700; }
        </style></head><body>
        <h1>PMO Audit Logs</h1><p>Generated ${escapeHtml(new Date().toLocaleString())}. Records: ${exportRows.length}.</p>
        <table><thead><tr><th>Time</th><th>User</th><th>Activity</th><th>Page / Item</th><th>IP Address</th><th>Browser</th></tr></thead>
        <tbody>${rows}</tbody></table></body></html>`);
      reportWindow.document.close();
      reportWindow.focus();
      reportWindow.print();
    } catch (requestError) {
      reportWindow.close();
      setError(requestError instanceof Error ? requestError.message : "Failed to export audit logs");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <PageMeta title="Audit Logs | PMO" description="PMO application audit trail" />
      <PageBreadcrumb pageTitle="Audit Logs" />

      {!isManager(currentUser) ? (
        <div className="border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
          Audit logs, including IP addresses, are available only to manager accounts.
        </div>
      ) : (
        <div className="border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4 dark:border-white/[0.05] sm:px-6">
            <div>
              <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">Recent Activity</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{total} matching event{total === 1 ? "" : "s"}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-5 py-4 dark:border-white/[0.05] sm:px-6">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search all audit logs"
              className="h-10 min-w-60 flex-1 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 outline-none placeholder:text-gray-500 focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-400"
            />
            <select value={activity} onChange={(event) => { setActivity(event.target.value); setPage(1); }} className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white">
              <option value="">All activities</option>
              <option value="LOGIN">Login</option>
              <option value="LOGOUT">Logout</option>
              <option value="PAGE_VIEW">Page view</option>
              <option value="AUDIT_LOG_EXPORT">Audit log export</option>
              <optgroup label="Machine parameters">
                <option value="MACHINE_PARAMETER_CREATED">Parameter created</option>
                <option value="MACHINE_PARAMETERS_IMPORTED">Parameters imported</option>
                <option value="MACHINE_PARAMETER_UPDATED">Parameter updated</option>
                <option value="MACHINE_PARAMETER_DELETED">Parameter deleted</option>
              </optgroup>
              <optgroup label="Schedules">
                <option value="SCHEDULE_PLAN_CREATED">Schedule created</option>
                <option value="SCHEDULE_PLAN_DELETED">Schedule deleted</option>
                <option value="SCHEDULE_APPROVED_ENGINEERING">Engineering approval</option>
                <option value="SCHEDULE_APPROVED_MANAGER">Manager approval</option>
              </optgroup>
              <optgroup label="Preventive orders">
                <option value="MAINTENANCE_ORDER_CREATED">Order created</option>
                <option value="MAINTENANCE_ORDER_UPDATED">Order updated</option>
                <option value="ORDER_CHECKLIST_SAVED">Checklist saved</option>
              </optgroup>
              <option value="USER_PROFILE_UPDATED">User profile updated</option>
            </select>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRefreshKey((value) => value + 1)}
                disabled={isLoading}
                className="border border-brand-500 bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={() => void exportLogs()}
                disabled={isExporting}
                className="border border-brand-500 bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isExporting ? "Exporting..." : "Export CSV"}
              </button>
              <button
                type="button"
                onClick={() => void exportPdf()}
                disabled={isExporting}
                className="border border-brand-500 bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Export PDF
              </button>
            </div>
          </div>

          <div className="grid gap-3 border-b border-gray-100 px-5 py-4 dark:border-white/[0.05] sm:grid-cols-2 sm:px-6">
            <label className="text-sm text-gray-700 dark:text-gray-300">
              From
              <input type="datetime-local" value={startAt} onChange={(event) => { setStartAt(event.target.value); setPage(1); }} className="mt-2 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
            </label>
            <label className="text-sm text-gray-700 dark:text-gray-300">
              To
              <input type="datetime-local" value={endAt} onChange={(event) => { setEndAt(event.target.value); setPage(1); }} className="mt-2 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
            </label>
          </div>

          {error ? (
            <p className="px-5 py-6 text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : (
            <div className="max-w-full overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-gray-100 bg-gray-50 text-xs uppercase text-gray-500 dark:border-white/[0.05] dark:bg-white/[0.02] dark:text-gray-400">
                  <tr>
                    <th className="px-5 py-3 font-medium">Time</th>
                    <th className="px-5 py-3 font-medium">User</th>
                    <th className="px-5 py-3 font-medium">Activity</th>
                    <th className="px-5 py-3 font-medium">Page/Item</th>
                    <th className="px-5 py-3 font-medium">IP Address</th>
                    <th className="px-5 py-3 font-medium">Browser</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                  {isLoading ? (
                    <tr><td className="px-5 py-6 text-gray-500 dark:text-gray-400" colSpan={6}>Loading audit logs...</td></tr>
                  ) : logs.length === 0 ? (
                    <tr><td className="px-5 py-6 text-gray-500 dark:text-gray-400" colSpan={6}>No audit events have been recorded yet.</td></tr>
                  ) : logs.map((entry) => (
                    <tr key={entry.id} className="align-top text-gray-600 dark:text-gray-300">
                      <td className="whitespace-nowrap px-5 py-4">{formatDateTime(entry.created_at)}</td>
                      <td className="px-5 py-4">{accountName(entry)}</td>
                      <td className="px-5 py-4 font-medium text-gray-800 dark:text-white/90">{entry.event_type}</td>
                      <td className="max-w-80 px-5 py-4">
                        <p className="break-words">{entry.action_label || entry.page_path || entry.entity_type || "-"}</p>
                        {entry.entity_id && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{entry.entity_type}: {entry.entity_id}</p>}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4">{entry.ip_address || "-"}</td>
                      <td className="max-w-64 break-words px-5 py-4 text-xs text-gray-500 dark:text-gray-400">{entry.user_agent || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!error && !isLoading && (
            <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-5 py-4 text-sm text-gray-600 dark:border-white/[0.05] dark:text-gray-300 sm:px-6">
              <span>Page {page} of {totalPages}</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1} className="border border-gray-300 px-3 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700">Previous</button>
                <button type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page >= totalPages} className="border border-gray-300 px-3 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700">Next</button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}