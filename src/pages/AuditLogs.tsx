import { useEffect, useState } from "react";
import { getCurrentUser, isManager } from "../auth/auth";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";
import { fetchAuditLogs, type AuditLogRecord } from "../services/pmoApi";

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

export default function AuditLogs() {
  const currentUser = getCurrentUser();
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadLogs = async () => {
    if (!currentUser || !isManager(currentUser)) return;

    setIsLoading(true);
    setError("");
    try {
      setLogs(await fetchAuditLogs(currentUser.role));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to fetch audit logs");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadLogs();
  }, []);

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
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Latest 200 application events</p>
            </div>
            <button
              type="button"
              onClick={() => void loadLogs()}
              disabled={isLoading}
              className="border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
            >
              Refresh
            </button>
          </div>

          {error ? (
            <p className="px-5 py-6 text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : (
            <div className="max-w-full overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-gray-100 bg-gray-50 text-xs uppercase text-gray-500 dark:border-white/[0.05] dark:bg-white/[0.02] dark:text-gray-400">
                  <tr>
                    <th className="px-5 py-3 font-medium">When</th>
                    <th className="px-5 py-3 font-medium">Account</th>
                    <th className="px-5 py-3 font-medium">Activity</th>
                    <th className="px-5 py-3 font-medium">Page / Item</th>
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
        </div>
      )}
    </>
  );
}