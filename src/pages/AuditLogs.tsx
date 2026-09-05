import { useEffect, useState } from "react";
import { getCurrentUser, canViewLogs } from "../auth/auth";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";
import Button from "../components/ui/button/Button";
import Badge from "../components/ui/badge/Badge";
import { exportAuditLogs, exportAuditLogsPdf, fetchAuditLogs, fetchMachines, type AuditLogRecord, type MachineRecord } from "../services/pmoApi";

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

function roleLabel(role: string | null) {
  if (!role) return "-";
  return role.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function machineLabel(machineNo: unknown, machinesByNo: Map<number, MachineRecord>): string {
  const no = machineNo != null ? Number(machineNo) : null;
  const machine = no != null ? machinesByNo.get(no) : null;
  if (machine) return `${machine.nama_mesin} (${machine.kode_mesin})`;
  return no != null ? `#${no}` : "#-";
}

// Turns an event_type + its metadata JSON into the same kind of human-readable
// sentence server.js builds for the CSV export, so the table and CSV always match.
function describeAuditEvent(entry: AuditLogRecord, machinesByNo: Map<number, MachineRecord> = new Map()): string {
  // metadata is stored via JSON.stringify() into a LONGTEXT column (MariaDB's
  // "JSON" type has no true JSON wire type), so it always arrives here as a
  // plain string, never a pre-parsed object - it must be parsed back.
  let parsedMeta: unknown = entry.metadata;
  if (typeof parsedMeta === "string") {
    try {
      parsedMeta = JSON.parse(parsedMeta);
    } catch {
      parsedMeta = {};
    }
  }
  const meta = (parsedMeta && typeof parsedMeta === "object" ? parsedMeta : {}) as Record<string, unknown>;
  const list = (value: unknown) => (Array.isArray(value) && value.length ? value.join(", ") : null);

  switch (entry.event_type) {
    case "LOGIN": return "Signed in to the application";
    case "LOGOUT": return "Signed out of the application";
    case "PAGE_VIEW": return `Viewed ${entry.page_path || "a page"}`;
    case "AUDIT_LOG_EXPORT": return `Exported audit logs (${String(meta.format || "csv").toUpperCase()})`;
    case "HISTORY_LOG_EXPORT": return "Exported the history log (CSV)";
    case "HISTORY_LOG_IMPORTED":
      return `Imported ${Number(meta.inserted) || 0} history log record(s)${meta.skipped ? `, skipped ${meta.skipped}` : ""}`;
    case "MACHINE_PARAMETER_CREATED": return `Added a parameter to machine ${machineLabel(meta.machineNo ?? entry.entity_id, machinesByNo)}`;
    case "MACHINE_PARAMETERS_IMPORTED": return `Imported ${Number(meta.inserted) || 0} machine parameter(s)`;
    case "MACHINE_PARAMETER_UPDATED": {
      const changes = (meta.changes && typeof meta.changes === "object" ? meta.changes : {}) as Record<
        string,
        { from?: string; to?: string } | undefined
      >;
      const changeKeys = Object.keys(changes);
      // Rows logged before this description was added only recorded which
      // field names changed, not the values or which machine/item - fall
      // back to that for old rows instead of showing a useless "for #-".
      if (!changeKeys.length && Array.isArray(meta.fields)) {
        return `Updated parameter fields: ${list(meta.fields) || "-"}`;
      }
      const label = machineLabel(meta.machineNo, machinesByNo);
      const itemName = (meta.partChecklist as string) || (meta.partMaster as string) || "a checklist item";
      const fieldLabels: Record<string, string> = {
        part_master: "Part Master",
        part_checklist: "Checklist",
        action: "Action",
        standard: "Standard",
      };
      const changeParts = changeKeys.map((field) => {
        const change = changes[field];
        const from = change?.from ? `"${change.from}"` : "(empty)";
        const to = change?.to ? `"${change.to}"` : "(empty)";
        return `${fieldLabels[field] || field}: ${from} -> ${to}`;
      });
      return changeParts.length
        ? `Updated checklist item "${itemName}" for ${label} - ${changeParts.join("; ")}`
        : `Updated checklist item "${itemName}" for ${label}`;
    }
    case "MACHINE_PARAMETER_DELETED": return "Deleted a machine parameter";
    case "SCHEDULE_PLAN_CREATED": {
      const month = typeof meta.month === "number" ? MONTH_NAMES[meta.month] : "-";
      return `Scheduled ${machineLabel(meta.machineNo, machinesByNo)} for ${month} ${meta.year ?? ""} (week ${meta.week ?? "-"})`;
    }
    case "SCHEDULE_PLAN_DELETED": return "Deleted a schedule plan";
    case "SCHEDULE_APPROVED_ENGINEERING": return "Approved a schedule (Engineering stage)";
    case "SCHEDULE_APPROVED_MANAGER": return "Approved a schedule (Manager stage)";
    case "MAINTENANCE_ORDER_CREATED": return `Created a preventive order for ${machineLabel(meta.machineNo, machinesByNo)} (status: ${meta.status ?? "-"})`;
    case "MAINTENANCE_ORDER_UPDATED": return `Updated order fields: ${list(meta.fields) || "-"}`;
    case "ORDER_CHECKLIST_SAVED": return `Saved checklist (${meta.itemsUpdated ?? 0} item(s) updated)`;
    case "USER_PROFILE_UPDATED": return `Updated profile fields: ${list(meta.fields) || "-"}`;
    default:
      return entry.action_label || entry.event_type.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());
  }
}

type BadgeColor = "success" | "primary" | "error" | "warning" | "info" | "light" | "dark";

// Short verb + color for the Action badge, so activities are scannable at a
// glance (green = create/approve, blue = update, red = delete, etc).
function actionMeta(eventType: string): { label: string; color: BadgeColor } {
  const upper = eventType.toUpperCase();
  if (upper === "LOGIN") return { label: "Login", color: "primary" };
  if (upper === "LOGOUT") return { label: "Logout", color: "light" };
  if (upper === "PAGE_VIEW") return { label: "View", color: "light" };
  if (upper.includes("DELETED")) return { label: "Delete", color: "error" };
  if (upper.includes("REJECTED")) return { label: "Reject", color: "warning" };
  if (upper.includes("APPROVED")) return { label: "Approve", color: "success" };
  if (upper.includes("IMPORTED")) return { label: "Import", color: "info" };
  if (upper.includes("EXPORT")) return { label: "Export", color: "info" };
  if (upper.includes("UPDATED") || upper.includes("SAVED")) return { label: "Update", color: "primary" };
  if (upper.includes("CREATED")) return { label: "Create", color: "success" };
  return { label: "Activity", color: "dark" };
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
  // Audit Logs is restricted to manager and engineering supervisor accounts.
  const canViewAuditLogs = canViewLogs(currentUser);
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [machinesByNo, setMachinesByNo] = useState<Map<number, MachineRecord>>(new Map());

  useEffect(() => {
    fetchMachines()
      .then((rows) => setMachinesByNo(new Map(rows.map((m) => [m.no, m]))))
      .catch((err) => console.error("Failed to load machines:", err));
  }, []);
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
    if (!canViewAuditLogs) {
      setIsLoading(false);
      return;
    }

    const loadInitialLogs = async () => {
      setIsLoading(true);
      setError("");
      try {
        const result = await fetchAuditLogs(currentUserRole ?? "", { page, search, activity, startAt, endAt });
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
  }, [activity, canViewAuditLogs, currentUserRole, endAt, page, refreshKey, search, startAt]);

  const exportLogs = async () => {
    if (!currentUser || !canViewAuditLogs) return;
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
    if (!currentUser || !canViewAuditLogs) return;
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
      const actionColors: Record<BadgeColor, string> = {
        success: "#12b76a", primary: "#465fff", error: "#f04438",
        warning: "#f79009", info: "#0ba5ec", light: "#98a2b3", dark: "#344054",
      };
      const rows = exportRows.map((entry) => {
        const action = actionMeta(entry.event_type);
        return `
        <tr>
          <td>${escapeHtml(formatDateTime(entry.created_at))}</td>
          <td><span style="display:inline-block;padding:2px 8px;border-radius:9999px;background:${actionColors[action.color]};color:#fff;font-weight:700;font-size:9px;">${escapeHtml(action.label.toUpperCase())}</span></td>
          <td>${escapeHtml(entry.entity_type)}</td>
          <td>${escapeHtml(accountName(entry))}</td>
          <td>${escapeHtml(roleLabel(entry.user_role))}</td>
          <td>${escapeHtml(describeAuditEvent(entry, machinesByNo))}</td>
          <td>${escapeHtml(entry.ip_address)}</td>
        </tr>`;
      }).join("");
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
        <table><thead><tr><th>Time</th><th>Action</th><th>Table</th><th>User</th><th>Role</th><th>Description</th><th>IP Address</th></tr></thead>
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

      {!canViewAuditLogs ? (
        <div className="border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
          Audit logs, including IP addresses, are available only to manager and engineering supervisor accounts.
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
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setSearch("");
                  setActivity("");
                  setStartAt("");
                  setEndAt("");
                  setPage(1);
                  setRefreshKey((value) => value + 1);
                }}
                disabled={isLoading}
              >
                Refresh
              </Button>
              <Button size="sm" variant="outline" onClick={() => void exportLogs()} disabled={isExporting}>
                {isExporting ? "Exporting..." : "Export CSV"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => void exportPdf()} disabled={isExporting}>
                Export PDF
              </Button>
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
                    <th className="px-5 py-3 font-medium">Timestamp</th>
                    <th className="px-5 py-3 font-medium">Action</th>
                    <th className="px-5 py-3 font-medium">Table</th>
                    <th className="px-5 py-3 font-medium">User</th>
                    <th className="px-5 py-3 font-medium">Role</th>
                    <th className="px-5 py-3 font-medium">Description</th>
                    <th className="px-5 py-3 font-medium">IP Address</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                  {isLoading ? (
                    <tr><td className="px-5 py-6 text-gray-500 dark:text-gray-400" colSpan={7}>Loading audit logs...</td></tr>
                  ) : logs.length === 0 ? (
                    <tr><td className="px-5 py-6 text-gray-500 dark:text-gray-400" colSpan={7}>No audit events have been recorded yet.</td></tr>
                  ) : logs.map((entry) => {
                    const action = actionMeta(entry.event_type);
                    return (
                      <tr key={entry.id} className="align-top text-gray-600 dark:text-gray-300">
                        <td className="whitespace-nowrap px-5 py-4">{formatDateTime(entry.created_at)}</td>
                        <td className="px-5 py-4">
                          <Badge size="sm" color={action.color}>{action.label.toUpperCase()}</Badge>
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 font-mono text-xs text-gray-500 dark:text-gray-400">{entry.entity_type || "-"}</td>
                        <td className="px-5 py-4">
                          <p className="font-medium text-gray-800 dark:text-white/90">{accountName(entry)}</p>
                          {entry.nickname && <p className="text-xs text-gray-400 dark:text-gray-500">{entry.nickname}</p>}
                        </td>
                        <td className="whitespace-nowrap px-5 py-4">{roleLabel(entry.user_role)}</td>
                        <td className="max-w-96 px-5 py-4">
                          <p className="break-words">{describeAuditEvent(entry, machinesByNo)}</p>
                        </td>
                        <td className="whitespace-nowrap px-5 py-4">{entry.ip_address || "-"}</td>
                      </tr>
                    );
                  })}
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