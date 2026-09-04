import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { getCurrentUser, canViewLogs } from "../auth/auth";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";
import Button from "../components/ui/button/Button";
import { Modal } from "../components/ui/modal";
import Badge from "../components/ui/badge/Badge";
import {
  fetchMachines,
  fetchHistoryLogs,
  exportHistoryLogs,
  importHistoryLogs,
  fetchOrderResults,
  fetchTechnicians,
  type MachineRecord,
  type HistoryLogRecord,
  type HistoryLogImportItem,
  type TechnicianRecord,
} from "../services/pmoApi";

// -------------------------------------------------------------------------
// Local helpers
// -------------------------------------------------------------------------

const MAIN_SUB_ORDER = ["MTC", "UTY", "BLD"];

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : dateFormatter.format(date);
}

function formatClockRange(start: string | null, end: string | null): string {
  if (!start && !end) return "-";
  return `${start ? start.slice(0, 5) : "?"} - ${end ? end.slice(0, 5) : "?"}`;
}

function statusBadgeColor(status: HistoryLogRecord["status"]): "warning" | "primary" | "success" {
  if (status === "In Progress") return "warning";
  if (status === "Approval") return "primary";
  return "success";
}

const toCsvValue = (value: unknown) => {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const parseCsvLine = (line: string): string[] => {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result.map((value) => value.trim());
};

type MachineGroup = {
  machineNo: number;
  machineAsset: string;
  machineName: string;
  childSub: string;
  entries: HistoryLogRecord[];
};

type MainSubGroup = {
  mainSub: string;
  machines: MachineGroup[];
  entryCount: number;
};

type OrderResultRow = {
  id: number;
  part_master: string;
  part_checklist: string;
  action: string | null;
  standard: string | null;
  result: string | null;
  justification: string | null;
};

// -------------------------------------------------------------------------
// Component
// -------------------------------------------------------------------------

export default function HistoryLogs() {
  const currentUser = getCurrentUser();
  const currentUserRole = currentUser?.role;
  // Same allow-list as the backend's isLogViewerRole() in server.js — keep in sync.
  const canViewHistoryLogs = canViewLogs(currentUser);

  // Deep-link support: /history-logs?machine_no=&technician=&start_at=&end_at=
  // pre-fills the matching filters below, e.g. when arriving from the
  // Technician Workload table's "Technician Detail" modal.
  const [searchParams, setSearchParams] = useSearchParams();

  const [machines, setMachines] = useState<MachineRecord[]>([]);
  const [technicians, setTechnicians] = useState<TechnicianRecord[]>([]);
  const [logs, setLogs] = useState<HistoryLogRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [isExporting, setIsExporting] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [mainSub, setMainSub] = useState("");
  const [childSub, setChildSub] = useState("");
  const [machineNo, setMachineNo] = useState(() => searchParams.get("machine_no") ?? "");
  const [machineId, setMachineId] = useState("");
  const [technician, setTechnician] = useState(() => searchParams.get("technician") ?? "");
  const [status, setStatus] = useState("");
  const [startAt, setStartAt] = useState(() => searchParams.get("start_at") ?? "");
  const [endAt, setEndAt] = useState(() => searchParams.get("end_at") ?? "");

  // Clear the deep-link params from the URL once read, so refreshing or
  // navigating back to this page later doesn't keep re-applying them.
  useEffect(() => {
    if (searchParams.has("machine_no") || searchParams.has("technician") || searchParams.has("start_at") || searchParams.has("end_at")) {
      setSearchParams(new URLSearchParams(), { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Expand/collapse state
  const [collapsedMainSubs, setCollapsedMainSubs] = useState<Set<string>>(new Set());
  const [expandedMachines, setExpandedMachines] = useState<Set<number>>(new Set());

  // Import modal
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // View Form modal
  const [viewingOrder, setViewingOrder] = useState<HistoryLogRecord | null>(null);
  const [orderResults, setOrderResults] = useState<OrderResultRow[]>([]);
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const [resultsError, setResultsError] = useState("");

  // Load machines and technicians once
  useEffect(() => {
    if (!canViewHistoryLogs) return;
    fetchMachines()
      .then(setMachines)
      .catch((err) => console.error("Failed to load machines:", err));
    fetchTechnicians()
      .then(setTechnicians)
      .catch((err) => console.error("Failed to load technicians:", err));
  }, [canViewHistoryLogs]);

  // Load history logs whenever a filter changes
  useEffect(() => {
    if (!canViewHistoryLogs) {
      setIsLoading(false);
      return;
    }

    const loadLogs = async () => {
      setIsLoading(true);
      setError("");
      try {
        const rows = await fetchHistoryLogs({
          role: currentUserRole,
          search,
          mainSub,
          childSub,
          machineNo,
          machineId,
          technician,
          status,
          startAt,
          endAt,
        });
        setLogs(rows);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch history logs");
      } finally {
        setIsLoading(false);
      }
    };

    void loadLogs();
  }, [canViewHistoryLogs, currentUserRole, search, mainSub, childSub, machineNo, machineId, technician, status, startAt, endAt, refreshKey]);

  // Child-sub options narrow to whatever main sub is selected
  const childSubOptions = useMemo(() => {
    const pool = mainSub ? machines.filter((m) => m.kategori === mainSub) : machines;
    return Array.from(new Set(pool.map((m) => m.sub_child).filter((v): v is string => Boolean(v)))).sort();
  }, [machines, mainSub]);

  // Reset child sub if it no longer applies once main sub changes
  useEffect(() => {
    if (childSub && !childSubOptions.includes(childSub)) {
      setChildSub("");
    }
  }, [childSubOptions, childSub]);

  // Machine dropdown narrows to whatever main/child sub is selected
  const machineOptions = useMemo(() => {
    return machines
      .filter((m) => (!mainSub || m.kategori === mainSub) && (!childSub || m.sub_child === childSub))
      .sort((a, b) => a.nama_mesin.localeCompare(b.nama_mesin));
  }, [machines, mainSub, childSub]);

  useEffect(() => {
    if (machineNo && machineOptions.length > 0 && !machineOptions.some((m) => String(m.no) === machineNo)) {
      setMachineNo("");
    }
  }, [machineOptions, machineNo]);

  const technicianOptions = useMemo(
    () => Array.from(new Set(technicians.map((t) => t.technician_name))).sort(),
    [technicians],
  );

  // Group flat log rows into Main Sub -> Machine -> chronological entries (oldest first)
  const groupedLogs = useMemo<MainSubGroup[]>(() => {
    const bySub = new Map<string, Map<number, MachineGroup>>();

    for (const entry of logs) {
      if (!bySub.has(entry.main_sub)) bySub.set(entry.main_sub, new Map());
      const machineMap = bySub.get(entry.main_sub)!;
      if (!machineMap.has(entry.machine_no)) {
        machineMap.set(entry.machine_no, {
          machineNo: entry.machine_no,
          machineAsset: entry.machine_asset,
          machineName: entry.machine_name,
          childSub: entry.sub_child || "Unassigned",
          entries: [],
        });
      }
      machineMap.get(entry.machine_no)!.entries.push(entry);
    }

    const subGroups: MainSubGroup[] = Array.from(bySub.entries()).map(([sub, machineMap]) => {
      const machineGroups = Array.from(machineMap.values())
        // entries already arrive oldest-first from the API, but re-sort defensively
        .map((group) => ({
          ...group,
          entries: [...group.entries].sort((a, b) => {
            const dateA = a.execution_date || a.preventive_date || "";
            const dateB = b.execution_date || b.preventive_date || "";
            return dateA.localeCompare(dateB);
          }),
        }))
        .sort((a, b) => a.machineName.localeCompare(b.machineName));

      return {
        mainSub: sub,
        machines: machineGroups,
        entryCount: machineGroups.reduce((sum, m) => sum + m.entries.length, 0),
      };
    });

    return subGroups.sort((a, b) => {
      const ai = MAIN_SUB_ORDER.indexOf(a.mainSub);
      const bi = MAIN_SUB_ORDER.indexOf(b.mainSub);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }, [logs]);

  const toggleMainSub = (sub: string) => {
    setCollapsedMainSubs((prev) => {
      const next = new Set(prev);
      if (next.has(sub)) next.delete(sub);
      else next.add(sub);
      return next;
    });
  };

  const toggleMachine = (machineNo: number) => {
    setExpandedMachines((prev) => {
      const next = new Set(prev);
      if (next.has(machineNo)) next.delete(machineNo);
      else next.add(machineNo);
      return next;
    });
  };

  // ------------------------------------------------------------------
  // View Form
  // ------------------------------------------------------------------
  const openForm = async (order: HistoryLogRecord) => {
    setViewingOrder(order);
    setOrderResults([]);
    setResultsError("");
    setIsLoadingResults(true);
    try {
      const rows = await fetchOrderResults(order.id);
      setOrderResults(rows as OrderResultRow[]);
    } catch (err) {
      setResultsError(err instanceof Error ? err.message : "Failed to load the checklist for this record.");
    } finally {
      setIsLoadingResults(false);
    }
  };

  const closeForm = () => {
    setViewingOrder(null);
    setOrderResults([]);
    setResultsError("");
  };

  // ------------------------------------------------------------------
  // Export / Import
  // ------------------------------------------------------------------
  const handleExport = async () => {
    if (!currentUser || !canViewHistoryLogs) return;
    if (startAt && endAt && startAt > endAt) {
      setError("The 'To' date must be after the 'From' date.");
      return;
    }
    setIsExporting(true);
    setError("");
    try {
      const file = await exportHistoryLogs(currentUser.id, {
        role: currentUserRole,
        search,
        mainSub,
        childSub,
        machineNo,
        machineId,
        technician,
        status,
        startAt,
        endAt,
      });
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = "pmo-history-logs.csv";
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export history logs");
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadTemplate = () => {
    const header = ["Asset_Code", "Machine_Name", "Preventive_Type", "Execution_Date", "Technician_Name", "Status"];
    const lines = machines.map((m) => [m.kode_mesin, m.nama_mesin, "", "", "", ""].map(toCsvValue).join(","));
    const csv = [header.join(","), ...lines].join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "history_log_import_template.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleImportCsv = async (file: File) => {
    const text = await file.text();
    const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 2) {
      setMessage("CSV file has no data rows.");
      return;
    }

    const items: HistoryLogImportItem[] = [];
    for (let i = 1; i < lines.length; i++) {
      const [assetCode, , preventiveType, executionDate, technicianName, status] = parseCsvLine(lines[i]);
      if (!assetCode || !preventiveType || !executionDate) continue;
      items.push({
        machine_asset: assetCode,
        preventive_types: preventiveType,
        execution_date: executionDate,
        technician_name: technicianName || null,
        status: (status as HistoryLogImportItem["status"]) || undefined,
      });
    }

    if (!items.length) {
      setMessage("No valid rows found. Each row needs at least Asset_Code, Preventive_Type, and Execution_Date.");
      return;
    }

    try {
      const result = await importHistoryLogs(items, currentUserRole);
      setMessage(
        `Imported ${result.inserted} record(s).` +
          (result.skipped?.length ? ` Skipped ${result.skipped.length}: ${result.skipped.slice(0, 5).join(", ")}${result.skipped.length > 5 ? "..." : ""}` : ""),
      );
      setRefreshKey((v) => v + 1);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to import CSV.");
    }
  };

  const inputClass =
    "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 outline-none placeholder:text-gray-500 focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-400";

  const totalEntries = logs.length;

  return (
    <>
      <PageMeta title="History Log | PMO" description="Preventive maintenance history per machine" />
      <PageBreadcrumb pageTitle="History Log" />

      {!canViewHistoryLogs ? (
        <div className="border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
          The History Log is available only to manager and engineering supervisor accounts.
        </div>
      ) : (
      <>
      <div className="border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4 dark:border-white/[0.05] sm:px-6">
          <div>
            <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">Machine Preventive History</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {totalEntries} matching record{totalEntries === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        {/* Filters row 1: search + sub/machine filters */}
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-5 py-4 dark:border-white/[0.05] sm:px-6">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search machine, technician, preventive type..."
            className={`min-w-60 flex-1 ${inputClass}`}
          />
          <select value={mainSub} onChange={(e) => setMainSub(e.target.value)} className={inputClass} style={{ width: 160 }}>
            <option value="">All Main Subs</option>
            {MAIN_SUB_ORDER.map((sub) => (
              <option key={sub} value={sub}>{sub}</option>
            ))}
          </select>
          <select value={childSub} onChange={(e) => setChildSub(e.target.value)} className={inputClass} style={{ width: 160 }}>
            <option value="">All Child Subs</option>
            {childSubOptions.map((sub) => (
              <option key={sub} value={sub}>{sub}</option>
            ))}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass} style={{ width: 170 }}>
            <option value="">All Statuses</option>
            <option value="In Progress">In Progress</option>
            <option value="Approval">Approval</option>
            <option value="Completed">Completed</option>
          </select>
        </div>

        {/* Filters row 2: machine name / id / technician + dates */}
        <div className="grid gap-3 border-b border-gray-100 px-5 py-4 dark:border-white/[0.05] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 sm:px-6">
          <label className="text-sm text-gray-700 dark:text-gray-300">
            Machine
            <select value={machineNo} onChange={(e) => setMachineNo(e.target.value)} className={`mt-2 ${inputClass}`}>
              <option value="">All Machines</option>
              {machineOptions.map((m) => (
                <option key={m.no} value={m.no}>{m.nama_mesin} ({m.kode_mesin})</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-gray-700 dark:text-gray-300">
            Machine ID / Asset Code
            <input
              value={machineId}
              onChange={(e) => setMachineId(e.target.value)}
              placeholder="e.g. EG 105"
              className={`mt-2 ${inputClass}`}
            />
          </label>
          <label className="text-sm text-gray-700 dark:text-gray-300">
            Technician
            <select value={technician} onChange={(e) => setTechnician(e.target.value)} className={`mt-2 ${inputClass}`}>
              <option value="">All Technicians</option>
              {technicianOptions.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-gray-700 dark:text-gray-300">
            From
            <input type="date" value={startAt} onChange={(e) => setStartAt(e.target.value)} className={`mt-2 ${inputClass}`} />
          </label>
          <label className="text-sm text-gray-700 dark:text-gray-300">
            To
            <input type="date" value={endAt} onChange={(e) => setEndAt(e.target.value)} className={`mt-2 ${inputClass}`} />
          </label>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-end gap-2 border-b border-gray-100 px-5 py-4 dark:border-white/[0.05] sm:px-6">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setSearch("");
              setMainSub("");
              setChildSub("");
              setMachineNo("");
              setMachineId("");
              setTechnician("");
              setStatus("");
              setStartAt("");
              setEndAt("");
              setRefreshKey((v) => v + 1);
            }}
            disabled={isLoading}
          >
            Refresh
          </Button>
          <Button size="sm" variant="outline" onClick={() => void handleExport()} disabled={isExporting}>
            {isExporting ? "Exporting..." : "Export CSV"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setIsImportModalOpen(true)}>
            Import CSV
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImportCsv(file);
              e.target.value = "";
            }}
          />
        </div>

        {message && (
          <div className="mx-5 mt-4 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-200 sm:mx-6">
            {message}
          </div>
        )}

        {/* Grouped tree: Main Sub -> Machine -> Entries */}
        {error ? (
          <p className="px-5 py-6 text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : isLoading ? (
          <p className="px-5 py-6 text-sm text-gray-500 dark:text-gray-400">Loading history log...</p>
        ) : groupedLogs.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-500 dark:text-gray-400">No preventive maintenance history found.</p>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-white/[0.05]">
            {groupedLogs.map((group) => {
              const isCollapsed = collapsedMainSubs.has(group.mainSub);
              return (
                <div key={group.mainSub}>
                  <button
                    type="button"
                    onClick={() => toggleMainSub(group.mainSub)}
                    className="flex w-full items-center justify-between gap-3 bg-gray-50 px-5 py-3 text-left dark:bg-white/[0.02] sm:px-6"
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-white/90">
                      <span className={`text-xs text-gray-400 transition-transform ${isCollapsed ? "" : "rotate-90"}`}>▸</span>
                      {group.mainSub}
                      <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-normal text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                        {group.machines.length} machine{group.machines.length === 1 ? "" : "s"} · {group.entryCount} record{group.entryCount === 1 ? "" : "s"}
                      </span>
                    </span>
                  </button>

                  {!isCollapsed && (
                    <div className="divide-y divide-gray-50 dark:divide-white/[0.03]">
                      {group.machines.map((machine) => {
                        const isExpanded = expandedMachines.has(machine.machineNo);
                        return (
                          <div key={machine.machineNo}>
                            <button
                              type="button"
                              onClick={() => toggleMachine(machine.machineNo)}
                              className="flex w-full items-center justify-between gap-3 px-5 py-3 pl-10 text-left hover:bg-gray-50 dark:hover:bg-white/[0.02] sm:px-6 sm:pl-12"
                            >
                              <span className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                                <span className={`text-xs text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`}>▸</span>
                                <span className="font-medium text-gray-800 dark:text-white/90">{machine.machineName}</span>
                                <span className="text-xs text-gray-400 dark:text-gray-500">({machine.machineAsset})</span>
                                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                                  {machine.childSub}
                                </span>
                              </span>
                              <span className="text-xs text-gray-400 dark:text-gray-500">
                                {machine.entries.length} record{machine.entries.length === 1 ? "" : "s"}
                              </span>
                            </button>

                            {isExpanded && (
                              <div className="max-w-full overflow-x-auto bg-white pl-10 dark:bg-gray-900 sm:pl-12">
                                <table className="min-w-full text-left text-sm">
                                  <thead className="border-y border-gray-100 bg-gray-50/60 text-xs uppercase text-gray-500 dark:border-white/[0.05] dark:bg-white/[0.02] dark:text-gray-400">
                                    <tr>
                                      <th className="px-4 py-2 font-medium">Date</th>
                                      <th className="px-4 py-2 font-medium">Preventive Type</th>
                                      <th className="px-4 py-2 font-medium">Time</th>
                                      <th className="px-4 py-2 font-medium">Technician</th>
                                      <th className="px-4 py-2 font-medium">Status</th>
                                      <th className="px-4 py-2 font-medium">Form</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-50 dark:divide-white/[0.03]">
                                    {machine.entries.map((entry) => (
                                      <tr key={entry.id} className="text-gray-600 dark:text-gray-300">
                                        <td className="whitespace-nowrap px-4 py-3">
                                          {formatDate(entry.execution_date || entry.preventive_date)}
                                        </td>
                                        <td className="px-4 py-3">{entry.preventive_types}</td>
                                        <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-400">
                                          {formatClockRange(entry.start_clock, entry.end_clock)}
                                        </td>
                                        <td className="px-4 py-3">{entry.technician_name || "-"}</td>
                                        <td className="px-4 py-3">
                                          <Badge size="sm" color={statusBadgeColor(entry.status)}>{entry.status}</Badge>
                                        </td>
                                        <td className="px-4 py-3">
                                          <Button size="sm" variant="outline" onClick={() => void openForm(entry)}>
                                            View Form
                                          </Button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Import modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 dark:bg-gray-900">
            <h4 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
              Import Legacy History Records from CSV
            </h4>

            <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-200">
              <p className="mb-2 font-semibold">📋 Import Procedure:</p>
              <ol className="list-decimal space-y-1 pl-5">
                <li>Download the template CSV below — it's pre-filled with every machine's Asset_Code and Machine_Name.</li>
                <li>Fill in Preventive_Type, Execution_Date (YYYY-MM-DD), Technician_Name, and Status for each row.</li>
                <li>Status is optional — leave it blank to default to "Completed".</li>
                <li>Save as CSV and import.</li>
              </ol>
            </div>

            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              <p className="mb-2 font-semibold">⚠️ Important Notes:</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>Rows with an unrecognized Asset_Code, or missing Preventive_Type / Execution_Date, are skipped.</li>
                <li>Imported records won't have a saved checklist form (they predate the digital form).</li>
                <li>This process can't be canceled once submitted.</li>
              </ul>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3">
              <Button size="sm" variant="outline" onClick={handleDownloadTemplate}>
                Download Template CSV
              </Button>
              <Button size="sm" variant="outline" onClick={() => setIsImportModalOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setIsImportModalOpen(false);
                  fileInputRef.current?.click();
                }}
              >
                Choose File & Upload
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* View Form modal (read-only) */}
      <Modal isOpen={!!viewingOrder} onClose={closeForm} className="max-w-[1000px] overflow-hidden rounded-2xl p-0" showCloseButton>
        {viewingOrder && (
          <div className="max-h-[85vh] overflow-y-auto p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {viewingOrder.machine_name} ({viewingOrder.machine_asset})
            </h3>
            <div className="mt-2 grid grid-cols-2 gap-3 text-sm text-gray-600 dark:text-gray-300 md:grid-cols-4">
              <div><span className="text-gray-400">Preventive Type</span><p className="font-medium">{viewingOrder.preventive_types}</p></div>
              <div><span className="text-gray-400">Date</span><p className="font-medium">{formatDate(viewingOrder.execution_date || viewingOrder.preventive_date)}</p></div>
              <div><span className="text-gray-400">Technician</span><p className="font-medium">{viewingOrder.technician_name || "-"}</p></div>
              <div>
                <span className="text-gray-400">Status</span>
                <p><Badge size="sm" color={statusBadgeColor(viewingOrder.status)}>{viewingOrder.status}</Badge></p>
              </div>
            </div>

            <div className="mt-6">
              {isLoadingResults ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">Loading checklist...</p>
              ) : resultsError ? (
                <p className="text-sm text-red-600 dark:text-red-400">{resultsError}</p>
              ) : orderResults.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No checklist is on file for this record (likely an imported legacy entry).
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-800/60">
                      <tr>
                        {["Checklist", "Action", "Standard", "Result", "Justification"].map((h) => (
                          <th key={h} className="border-b border-gray-200 px-3 py-2 text-xs font-semibold uppercase text-gray-600 dark:border-gray-700 dark:text-gray-300">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                      {orderResults.map((row) => (
                        <tr key={row.id}>
                          <td className="px-3 py-2 align-top text-gray-700 dark:text-gray-300">{row.part_checklist}</td>
                          <td className="px-3 py-2 align-top text-gray-700 dark:text-gray-300">{row.action || "-"}</td>
                          <td className="px-3 py-2 align-top text-gray-700 dark:text-gray-300">{row.standard || "-"}</td>
                          <td className="px-3 py-2 align-top text-gray-700 dark:text-gray-300">{row.result || "-"}</td>
                          <td className="px-3 py-2 align-top text-gray-700 dark:text-gray-300">{row.justification || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end border-t border-gray-200 pt-4 dark:border-gray-700">
              <Button variant="outline" onClick={closeForm}>Close</Button>
            </div>
          </div>
        )}
      </Modal>
      </>
      )}
    </>
  );
}
