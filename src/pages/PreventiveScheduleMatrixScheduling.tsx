import { useCallback, useEffect, useMemo, useState } from "react";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import ComponentCard from "../components/common/ComponentCard";
import PageMeta from "../components/common/PageMeta";
import Button from "../components/ui/button/Button";
import Badge from "../components/ui/badge/Badge";
import { Modal } from "../components/ui/modal";
import {
  machineTypeOptions,
  type MachineSub,
  type PlannedPreventive,
  type PreventiveType,
  // writeScheduledPlans,
} from "../data/preventiveMaintenanceData";
import { useSchedules, useApprovedOrders, invalidateScheduleData } from "../hooks/useScheduleData";
import {
  createApprovedOrder,
  createSchedulePlan,
  deleteSchedulePlan,
  fetchMachines,
  fetchPreventiveTypes,
  type MachineRecord,
  type PreventiveTypeRecord,
  updateScheduleStatus,
} from "../services/pmoApi";
import { canApproveEngineering, getCurrentUser, isManager } from "../auth/auth";

/**
 * EXPERIMENTAL - Preventive Schedule Assignment > Matrix Scheduling.
 *
 * Not a replacement for the other three sibling pages (Machines to
 * Schedule, Calendar & Matrix View, Scheduled Preventive Entries) - this
 * is a separate, standalone trial of a different workflow: instead of
 * checking boxes in a table, you click directly on an empty matrix cell to
 * pick preventive types for that exact machine/month/week, build up a
 * batch of pending picks across as many cells as you like, then save them
 * all as Draft schedules in one go. Approving/deleting those drafts is
 * done right below the matrix on this same page, instead of navigating to
 * the separate Scheduled Preventive Entries page.
 */

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const monthAbbrev = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKS_PER_MONTH = 5;
const subTabs: MachineSub[] = ["MTC", "UTY", "BLD"];

const cellKey = (month: number, week: number) => `${month}-${week}`;
const splitTypes = (raw: string | null | undefined): string[] =>
  String(raw ?? "")
    .split(/[,+/]/)
    .map((type) => type.trim().replace(/\s+/g, " "))
    .filter(Boolean);
const normalizeLabel = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

type CellStatus = "scheduled" | "completed";
type MatrixCell = { types: string[]; status: CellStatus };

type MachineRow = {
  machineId: string;
  assetNumber: string;
  machineName: string;
  location: string | null;
};

export default function PreventiveScheduleMatrixScheduling() {
  const currentUser = getCurrentUser();

  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [activeTab, setActiveTab] = useState<MachineSub>("UTY");
  const [machineRecords, setMachineRecords] = useState<MachineRecord[]>([]);
  const [preventiveTypes, setPreventiveTypes] = useState<PreventiveTypeRecord[]>([]);
  const [isLoadingMachines, setIsLoadingMachines] = useState(true);

  // Unscoped ("All" years) - the year dropdown needs to see every year that
  // has ever had data, not just the one currently selected.
  const { schedules, refetchSchedules } = useSchedules("All");
  const { orders } = useApprovedOrders("All");

  // Pending (not yet saved) picks made by clicking empty matrix cells.
  // Keyed by "machineId|month-week" -> the set of type abbreviations chosen
  // for that cell so far.
  const [pendingSelections, setPendingSelections] = useState<Map<string, Set<string>>>(new Map());
  const [activeCell, setActiveCell] = useState<{ machineId: string; month: number; week: number } | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);

  useEffect(() => {
    const loadMachines = async () => {
      try {
        setIsLoadingMachines(true);
        const [machinesData, typesData] = await Promise.all([fetchMachines(), fetchPreventiveTypes()]);
        setMachineRecords(machinesData);
        setPreventiveTypes(typesData);
      } catch (error) {
        console.error("Failed to load matrix scheduling data:", error);
      } finally {
        setIsLoadingMachines(false);
      }
    };
    void loadMachines();
  }, []);

  const yearOptions = useMemo(() => {
    const years = new Set<number>();
    schedules.forEach((s) => years.add(s.tahun));
    orders.forEach((o) => years.add(o.year));
    years.add(new Date().getFullYear());
    years.add(selectedYear);
    return Array.from(years).sort((a, b) => a - b);
  }, [schedules, orders, selectedYear]);

  const typeLabelByCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of preventiveTypes) map.set(t.abbreviation, t.parameter);
    return map;
  }, [preventiveTypes]);

  const abbreviationLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of preventiveTypes) {
      map.set(normalizeLabel(t.abbreviation), t.abbreviation);
      map.set(normalizeLabel(t.parameter), t.abbreviation);
    }
    return map;
  }, [preventiveTypes]);

  const resolveAbbreviation = useCallback(
    (raw: string): string => {
      const key = normalizeLabel(raw);
      const exact = abbreviationLookup.get(key);
      if (exact) return exact;
      const fuzzy = preventiveTypes.find((t) => {
        const full = normalizeLabel(t.parameter);
        return full.length > 2 && (key.includes(full) || full.includes(key));
      });
      return fuzzy ? fuzzy.abbreviation : raw;
    },
    [abbreviationLookup, preventiveTypes],
  );

  const splitTypesAsAbbreviations = useCallback(
    (raw: string | null | undefined): string[] => splitTypes(raw).map(resolveAbbreviation),
    [resolveAbbreviation],
  );

  const machinesForSub = useMemo<MachineRow[]>(
    () =>
      machineRecords
        .filter((m) => m.kategori === activeTab)
        .map((m) => ({
          machineId: String(m.no),
          assetNumber: m.kode_mesin,
          machineName: m.nama_mesin,
          location: m.lokasi,
        }))
        .sort((a, b) => a.assetNumber.localeCompare(b.assetNumber)),
    [machineRecords, activeTab],
  );

  const [matrixPageSize, setMatrixPageSize] = useState(20);
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  const [hoveredColKey, setHoveredColKey] = useState<string | null>(null);
  const [currentMatrixPage, setCurrentMatrixPage] = useState(1);

  useEffect(() => {
    setCurrentMatrixPage(1);
  }, [activeTab, selectedYear, matrixPageSize]);

  const matrixPageCount = Math.max(1, Math.ceil(machinesForSub.length / matrixPageSize));

  useEffect(() => {
    setCurrentMatrixPage((page) => Math.min(page, matrixPageCount));
  }, [matrixPageCount]);

  const paginatedMachinesForSub = useMemo(
    () => machinesForSub.slice((currentMatrixPage - 1) * matrixPageSize, currentMatrixPage * matrixPageSize),
    [machinesForSub, currentMatrixPage, matrixPageSize],
  );

  // machineId -> "month-week" -> existing scheduled/completed cell.
  // Same pairing logic as the real Yearly Schedule Matrix, so this page's
  // read-only cells look identical to what you'd see there.
  const existingMatrix = useMemo(() => {
    const map = new Map<string, Map<string, MatrixCell>>();
    const upsert = (machineId: string, month: number, week: number, types: string[], status: CellStatus) => {
      if (!map.has(machineId)) map.set(machineId, new Map());
      const machineMap = map.get(machineId)!;
      const key = cellKey(month, week);
      const existing = machineMap.get(key);
      if (!existing) {
        machineMap.set(key, { types, status });
        return;
      }
      machineMap.set(key, {
        types: Array.from(new Set([...existing.types, ...types])),
        status: existing.status === "completed" ? "completed" : status,
      });
    };

    for (const sched of schedules) {
      if (sched.tahun !== selectedYear) continue;
      upsert(String(sched.machine_no), sched.bulan, sched.minggu, splitTypesAsAbbreviations(sched.preventive_types), "scheduled");
    }
    for (const order of orders) {
      if (order.year !== selectedYear || order.status !== "Completed") continue;
      upsert(String(order.machine_no), order.month, order.week, splitTypesAsAbbreviations(order.preventive_types), "completed");
    }
    return map;
  }, [schedules, orders, selectedYear, splitTypesAsAbbreviations]);

  const pendingKey = (machineId: string, month: number, week: number) => `${machineId}|${cellKey(month, week)}`;

  const totalPendingCells = pendingSelections.size;
  const totalPendingTypes = useMemo(
    () => Array.from(pendingSelections.values()).reduce((sum, set) => sum + set.size, 0),
    [pendingSelections],
  );

  const handleCellClick = (machineId: string, month: number, week: number) => {
    const hasExisting = existingMatrix.get(machineId)?.get(cellKey(month, week));
    if (hasExisting) return; // already scheduled/completed - not pickable here
    setActiveCell({ machineId, month, week });
  };

  const toggleActiveCellType = (type: string) => {
    if (!activeCell) return;
    const key = pendingKey(activeCell.machineId, activeCell.month, activeCell.week);
    setPendingSelections((prev) => {
      const next = new Map(prev);
      const current = new Set(next.get(key) ?? []);
      if (current.has(type)) current.delete(type);
      else current.add(type);
      if (current.size === 0) next.delete(key);
      else next.set(key, current);
      return next;
    });
  };

  const clearAllPending = () => setPendingSelections(new Map());

  const saveDraftPlan = async () => {
    if (totalPendingCells === 0) return;
    setIsSavingDraft(true);
    let failureCount = 0;

    for (const [key, typeSet] of pendingSelections) {
      const [machineId, monthWeek] = key.split("|");
      const [monthStr, weekStr] = monthWeek.split("-");
      const month = Number(monthStr);
      const week = Number(weekStr);
      const machine = machinesForSub.find((m) => m.machineId === machineId);
      if (!machine) continue;

      const chosenNames = Array.from(typeSet).map((code) => typeLabelByCode.get(code) ?? code);

      // Local-timezone date extraction (not toISOString().slice(0,10)) -
      // avoids the off-by-one-day bug for timezones ahead of UTC.
      const scheduledDateObj = new Date(selectedYear, month, (week - 1) * 7 + 1);
      const scheduledDate = `${scheduledDateObj.getFullYear()}-${String(scheduledDateObj.getMonth() + 1).padStart(2, "0")}-${String(scheduledDateObj.getDate()).padStart(2, "0")}`;

      try {
        await createSchedulePlan({
          machine_no: Number(machine.machineId),
          machine_asset: machine.assetNumber,
          machine_name: machine.machineName,
          department: activeTab,
          location: machine.location || null,
          sub: activeTab,
          tahun: selectedYear,
          bulan: month,
          minggu: week,
          tanggal_jadwal: scheduledDate,
          preventive_types: chosenNames.join(","),
          draft_date: new Date().toISOString(),
          status: "Draft",
          current_role: currentUser?.role,
        });
      } catch (error) {
        console.error(`Failed to save draft for machine ${machineId}:`, error);
        failureCount += 1;
      }
    }

    setIsSavingDraft(false);
    clearAllPending();
    await refetchSchedules();
    invalidateScheduleData();

    if (failureCount > 0) {
      alert(`${failureCount} draft(s) failed to save. Check the console for details.`);
    }
  };

  // ---------------------------------------------------------------------
  // Embedded Scheduled Preventive Entries (scoped to the active sub+year)
  // ---------------------------------------------------------------------

  const entriesForSubYear = useMemo(() => {
    return schedules
      .filter((s) => s.tahun === selectedYear && s.sub === activeTab)
      .map((s): PlannedPreventive & { assetNumber: string } => {
        const machine = machineRecords.find((m) => String(m.no) === String(s.machine_no));
        return {
          id: String(s.id),
          sub: s.sub,
          machineId: String(s.machine_no),
          machineAsset: s.machine_asset || String(s.machine_no),
          machineName: s.machine_name || "Unknown",
          department: s.department || "",
          location: s.location || null,
          year: s.tahun,
          month: s.bulan,
          week: s.minggu,
          scheduledDate: s.tanggal_jadwal || "",
          preventiveTypes: String(s.preventive_types).split(",").filter(Boolean),
          status: s.status,
          approvedByEngineeringUser: s.approved_by_engineering_user || null,
          approvedByEngineeringDate: s.approved_by_engineering_date || null,
          approvedByManagerUser: s.approved_by_manager_user || null,
          approvedByManagerDate: s.approved_by_manager_date || null,
          assetNumber: machine?.kode_mesin || String(s.machine_no),
        };
      })
      .sort((a, b) => a.assetNumber.localeCompare(b.assetNumber));
  }, [schedules, machineRecords, selectedYear, activeTab]);

  const [entriesPageSize, setEntriesPageSize] = useState(25);
  const [currentEntriesPage, setCurrentEntriesPage] = useState(1);

  useEffect(() => {
    setCurrentEntriesPage(1);
  }, [activeTab, selectedYear, entriesPageSize]);

  const entriesPageCount = Math.max(1, Math.ceil(entriesForSubYear.length / entriesPageSize));

  useEffect(() => {
    setCurrentEntriesPage((page) => Math.min(page, entriesPageCount));
  }, [entriesPageCount]);

  const paginatedEntriesForSubYear = useMemo(
    () => entriesForSubYear.slice((currentEntriesPage - 1) * entriesPageSize, currentEntriesPage * entriesPageSize),
    [entriesForSubYear, currentEntriesPage, entriesPageSize],
  );

  const [entryActionInFlight, setEntryActionInFlight] = useState<Set<string>>(new Set());

  const approveEngineering = async (entry: PlannedPreventive) => {
    if (!canApproveEngineering(currentUser) || entry.status !== "Draft" || entryActionInFlight.has(entry.id)) return;
    setEntryActionInFlight((prev) => new Set(prev).add(entry.id));
    const approvedAt = new Date().toISOString();
    try {
      await updateScheduleStatus(
        Number(entry.id),
        "Approved by Engineering",
        {
          machine_name: entry.machineName,
          machine_asset: entry.machineAsset || entry.machineId,
          department: entry.department,
          location: entry.location || null,
          approved_by_engineering_date: approvedAt,
          approved_by_engineering_user: currentUser?.nickname || currentUser?.name,
        },
        currentUser?.role,
        currentUser?.id,
      );
      await refetchSchedules();
      invalidateScheduleData();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Engineering approval failed.");
    } finally {
      setEntryActionInFlight((prev) => {
        const next = new Set(prev);
        next.delete(entry.id);
        return next;
      });
    }
  };

  const approveForPmo = async (entry: PlannedPreventive) => {
    if (!isManager(currentUser) || entry.status !== "Approved by Engineering" || entryActionInFlight.has(entry.id)) return;
    setEntryActionInFlight((prev) => new Set(prev).add(entry.id));
    const approvedAt = new Date().toISOString();
    try {
      await updateScheduleStatus(
        Number(entry.id),
        "Approved by Manager",
        {
          machine_name: entry.machineName,
          machine_asset: entry.machineAsset || entry.machineId,
          department: entry.department,
          location: entry.location || null,
          approved_by_manager_date: approvedAt,
          approved_by_manager_user: currentUser?.nickname || currentUser?.name,
        },
        currentUser?.role,
        currentUser?.id,
      );
      await createApprovedOrder({
        machine_no: Number(entry.machineId) || 0,
        machine_asset: entry.machineAsset || entry.machineId,
        machine_name: entry.machineName,
        location: entry.location || null,
        department: entry.department,
        sub: entry.sub,
        year: entry.year,
        month: entry.month,
        week: entry.week,
        preventive_types: entry.preventiveTypes.join(","),
        preventive_date: null,
        execution_date: null,
        start_clock: "08:00:00",
        end_clock: "10:00:00",
        technician_name: "Planner",
        status: "In Progress",
        approved_by_manager_date: approvedAt,
        approved_by_manager_user: currentUser?.nickname || currentUser?.name,
      });
      await refetchSchedules();
      invalidateScheduleData();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Manager approval failed.");
    } finally {
      setEntryActionInFlight((prev) => {
        const next = new Set(prev);
        next.delete(entry.id);
        return next;
      });
    }
  };

  const removeEntry = async (entry: PlannedPreventive) => {
    if (entry.status === "Approved by Manager" || entryActionInFlight.has(entry.id)) return;
    setEntryActionInFlight((prev) => new Set(prev).add(entry.id));
    try {
      const numericId = Number(entry.id);
      if (!Number.isNaN(numericId)) await deleteSchedulePlan(numericId);
      await refetchSchedules();
      invalidateScheduleData();
    } catch (error) {
      console.error("Failed to delete schedule:", error);
    } finally {
      setEntryActionInFlight((prev) => {
        const next = new Set(prev);
        next.delete(entry.id);
        return next;
      });
    }
  };

  const activeCellExistingTypes = activeCell
    ? existingMatrix.get(activeCell.machineId)?.get(cellKey(activeCell.month, activeCell.week))?.types
    : undefined;
  const activeCellPendingTypes = activeCell
    ? pendingSelections.get(pendingKey(activeCell.machineId, activeCell.month, activeCell.week)) ?? new Set<string>()
    : new Set<string>();
  const activeCellMachine = activeCell ? machinesForSub.find((m) => m.machineId === activeCell.machineId) : undefined;

  return (
    <>
      <PageMeta
        // title="Matrix Scheduling (Experimental)"
        description="Click cells directly in the matrix to schedule preventive types, then approve them below"
      />
      <PageBreadcrumb pageTitle="Matrix Scheduling (Experimental)" />

      <div className="space-y-6">
        <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
          <strong>Experimental page.</strong> This is a trial of an alternative scheduling workflow (click matrix cells
          directly instead of using the Machines to Schedule checkbox table). It doesn't replace Machines to Schedule,
          Calendar & Matrix View, or Scheduled Preventive Entries - all three still work exactly as before.
        </div>

        <ComponentCard title="Matrix Scheduling Controls">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm text-gray-700 dark:text-gray-300">
                <span className="mb-1 block text-xs font-semibold">Year</span>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                >
                  {yearOptions.map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </label>

              <div className="flex gap-2 rounded-2xl border border-gray-200 bg-gray-50 p-1.5 dark:border-gray-800 dark:bg-gray-800/40">
                {subTabs.map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                      activeTab === tab
                        ? "bg-white text-gray-900 shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:text-white dark:ring-gray-700"
                        : "text-gray-500 hover:bg-white/70 hover:text-gray-700 dark:text-gray-400"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              {totalPendingCells > 0 && (
                <>
                  <span className="text-sm text-gray-600 dark:text-gray-300">
                    {totalPendingCells} cell{totalPendingCells === 1 ? "" : "s"} · {totalPendingTypes} type
                    {totalPendingTypes === 1 ? "" : "s"} pending
                  </span>
                  <Button size="sm" variant="outline" onClick={clearAllPending} disabled={isSavingDraft}>
                    Clear Pending
                  </Button>
                </>
              )}
              <Button size="sm" onClick={() => void saveDraftPlan()} disabled={totalPendingCells === 0 || isSavingDraft}>
                {isSavingDraft ? "Saving..." : `Save as Draft${totalPendingCells > 0 ? ` (${totalPendingCells})` : ""}`}
              </Button>
            </div>
          </div>

          {isLoadingMachines ? (
            <p className="py-10 text-center text-sm text-gray-400 dark:text-gray-500">Loading machines...</p>
          ) : (
            <div className="overflow-auto rounded-xl border border-gray-200 dark:border-gray-700" style={{ maxHeight: "600px" }}>
              <table className="min-w-full border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="sticky top-0 left-0 z-30 border border-gray-200 bg-gray-50 px-2 py-2 text-left font-semibold text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200" style={{ minWidth: 90 }}>
                      Asset Code
                    </th>
                    <th className="sticky top-0 left-[90px] z-30 border border-gray-200 bg-gray-50 px-2 py-2 text-left font-semibold text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200" style={{ minWidth: 160 }}>
                      Machine Name
                    </th>
                    {monthNames.map((month) => (
                      <th
                        key={month}
                        colSpan={WEEKS_PER_MONTH}
                        className="sticky top-0 z-20 border border-gray-200 bg-gray-50 px-1 py-1 text-center font-semibold text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                      >
                        {monthAbbrev[monthNames.indexOf(month)]}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    <th className="sticky top-[29px] left-0 z-30 border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800" />
                    <th className="sticky top-[29px] left-[90px] z-30 border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800" />
                    {monthNames.flatMap((_, month) =>
                      Array.from({ length: WEEKS_PER_MONTH }, (_, i) => {
                        const week = i + 1;
                        const colKey = cellKey(month, week);
                        const isColHovered = hoveredColKey === colKey;
                        return (
                          <th
                            key={colKey}
                            onMouseEnter={() => setHoveredColKey(colKey)}
                            onMouseLeave={() => setHoveredColKey(null)}
                            className={`sticky top-[29px] z-20 border border-gray-200 px-1 py-1 text-center font-semibold transition-colors dark:border-gray-700 ${
                              isColHovered
                                ? "bg-brand-100 text-gray-700 dark:bg-brand-500/20 dark:text-gray-200"
                                : "bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                            }`}
                            style={{ minWidth: 26 }}
                          >
                            W{week}
                          </th>
                        );
                      }),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {paginatedMachinesForSub.map((machine) => {
                    const isRowHovered = hoveredRowId === machine.machineId;
                    const rowBg = isRowHovered ? "bg-brand-50 dark:bg-brand-500/10" : "bg-white dark:bg-gray-900";
                    return (
                    <tr key={machine.machineId}>
                      <td
                        onMouseEnter={() => setHoveredRowId(machine.machineId)}
                        onMouseLeave={() => setHoveredRowId(null)}
                        className={`sticky left-0 z-10 border border-gray-200 px-2 py-1 font-medium text-gray-700 transition-colors dark:border-gray-700 dark:text-gray-200 ${rowBg}`}
                      >
                        {machine.assetNumber}
                      </td>
                      <td
                        onMouseEnter={() => setHoveredRowId(machine.machineId)}
                        onMouseLeave={() => setHoveredRowId(null)}
                        className={`sticky left-[90px] z-10 border border-gray-200 px-2 py-1 text-gray-700 transition-colors dark:border-gray-700 dark:text-gray-200 ${rowBg}`}
                      >
                        {machine.machineName}
                      </td>
                      {monthNames.map((_, month) =>
                        Array.from({ length: WEEKS_PER_MONTH }, (_, i) => {
                          const week = i + 1;
                          const colKey = cellKey(month, week);
                          const existing = existingMatrix.get(machine.machineId)?.get(colKey);
                          const pending = pendingSelections.get(pendingKey(machine.machineId, month, week));
                          const bg = existing
                            ? existing.status === "completed"
                              ? "bg-green-300 dark:bg-green-700/70"
                              : "bg-yellow-200 dark:bg-yellow-600/60"
                            : pending
                              ? "bg-brand-200 dark:bg-brand-500/40"
                              : "";
                          const label = existing ? existing.types.join("+") : pending ? Array.from(pending).join("+") : "";
                          const isColHovered = hoveredColKey === colKey;
                          // Ring instead of background for the hover itself,
                          // so an existing yellow/green/blue cell's own
                          // status color stays fully visible underneath.
                          const ringClass =
                            isRowHovered && isColHovered
                              ? "ring-2 ring-inset ring-brand-500"
                              : isRowHovered || isColHovered
                                ? "ring-1 ring-inset ring-brand-300 dark:ring-brand-400/60"
                                : "";
                          return (
                            <td
                              key={`${machine.machineId}-${month}-${week}`}
                              onClick={() => handleCellClick(machine.machineId, month, week)}
                              onMouseEnter={() => {
                                setHoveredRowId(machine.machineId);
                                setHoveredColKey(colKey);
                              }}
                              onMouseLeave={() => {
                                setHoveredRowId(null);
                                setHoveredColKey(null);
                              }}
                              className={`whitespace-nowrap border border-gray-200 px-1 py-1 text-center font-semibold text-gray-800 transition-colors dark:border-gray-700 dark:text-gray-100 ${
                                bg || (isRowHovered || isColHovered ? "bg-gray-50 dark:bg-white/[0.04]" : "bg-white dark:bg-gray-900")
                              } ${ringClass} ${existing ? "cursor-not-allowed" : "cursor-pointer"}`}
                              title={existing ? "Already scheduled" : "Click to pick preventive types"}
                            >
                              {label}
                            </td>
                          );
                        }),
                      )}
                    </tr>
                    );
                  })}
                  {machinesForSub.length === 0 && (
                    <tr>
                      <td colSpan={2 + 12 * WEEKS_PER_MONTH} className="px-4 py-6 text-center text-gray-400">
                        No machines found for {activeTab}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {!isLoadingMachines && machinesForSub.length > 0 && (
            <div className="mt-3 flex flex-col items-center justify-between gap-2 sm:flex-row">
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Showing {(currentMatrixPage - 1) * matrixPageSize + 1}-
                  {Math.min(currentMatrixPage * matrixPageSize, machinesForSub.length)} of{" "}
                  {machinesForSub.length} machines
                </span>
                <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                  <span>Rows per page</span>
                  <select
                    value={matrixPageSize}
                    onChange={(e) => setMatrixPageSize(Number(e.target.value))}
                    className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  >
                    {[10, 20, 50, 100].map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCurrentMatrixPage((p) => Math.max(1, p - 1))}
                  disabled={currentMatrixPage <= 1}
                >
                  Previous
                </Button>
                <span className="text-xs text-gray-600 dark:text-gray-300">
                  Page {currentMatrixPage} of {matrixPageCount}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCurrentMatrixPage((p) => Math.min(matrixPageCount, p + 1))}
                  disabled={currentMatrixPage >= matrixPageCount}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </ComponentCard>

        <ComponentCard title={`Scheduled Preventive Entries - ${activeTab} ${selectedYear}`}>
          {entriesForSubYear.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400 dark:text-gray-500">
              No scheduled entries yet for {activeTab} in {selectedYear}.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800/60">
                  <tr>
                    {["Asset", "Machine", "Month", "Week", "Type", "Status", "Action"].map((h) => (
                      <th key={h} className="border-b border-gray-200 px-3 py-2 text-xs font-semibold uppercase text-gray-600 dark:border-gray-700 dark:text-gray-300">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                  {paginatedEntriesForSubYear.map((entry) => (
                    <tr key={entry.id}>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{entry.assetNumber}</td>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{entry.machineName}</td>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{monthNames[entry.month]}</td>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-300">Week {entry.week}</td>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{entry.preventiveTypes.join(" + ")}</td>
                      <td className="px-3 py-2">
                        <Badge
                          size="sm"
                          color={entry.status === "Approved by Manager" ? "success" : entry.status === "Approved by Engineering" ? "primary" : "warning"}
                        >
                          {entry.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        {entry.status === "Approved by Manager" ? (
                          <span className="text-xs italic text-gray-400 dark:text-gray-500">Locked</span>
                        ) : (
                          <div className="flex gap-2">
                            {entry.status === "Draft" && canApproveEngineering(currentUser) && (
                              <Button size="sm" onClick={() => void approveEngineering(entry)} disabled={entryActionInFlight.has(entry.id)}>
                                {entryActionInFlight.has(entry.id) ? "..." : "Engineering"}
                              </Button>
                            )}
                            {entry.status === "Approved by Engineering" && isManager(currentUser) && (
                              <Button size="sm" onClick={() => void approveForPmo(entry)} disabled={entryActionInFlight.has(entry.id)}>
                                {entryActionInFlight.has(entry.id) ? "..." : "Manager & Send"}
                              </Button>
                            )}
                            <Button size="sm" variant="outline" onClick={() => void removeEntry(entry)} disabled={entryActionInFlight.has(entry.id)}>
                              Delete
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {entriesForSubYear.length > 0 && (
            <div className="mt-3 flex flex-col items-center justify-between gap-2 sm:flex-row">
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Showing {(currentEntriesPage - 1) * entriesPageSize + 1}-
                  {Math.min(currentEntriesPage * entriesPageSize, entriesForSubYear.length)} of{" "}
                  {entriesForSubYear.length} entries
                </span>
                <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                  <span>Rows per page</span>
                  <select
                    value={entriesPageSize}
                    onChange={(e) => setEntriesPageSize(Number(e.target.value))}
                    className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  >
                    {[10, 25, 50, 100].map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCurrentEntriesPage((p) => Math.max(1, p - 1))}
                  disabled={currentEntriesPage <= 1}
                >
                  Previous
                </Button>
                <span className="text-xs text-gray-600 dark:text-gray-300">
                  Page {currentEntriesPage} of {entriesPageCount}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCurrentEntriesPage((p) => Math.min(entriesPageCount, p + 1))}
                  disabled={currentEntriesPage >= entriesPageCount}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </ComponentCard>
      </div>

      <Modal isOpen={!!activeCell} onClose={() => setActiveCell(null)} className="max-w-[720px] rounded-2xl p-6" showCloseButton>
        {activeCell && activeCellMachine && (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {activeCellMachine.machineName} ({activeCellMachine.assetNumber})
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {monthNames[activeCell.month]} {selectedYear} - Week {activeCell.week}
            </p>

            {activeCellExistingTypes ? (
              <p className="mt-4 text-sm text-gray-600 dark:text-gray-300">
                Already scheduled: {activeCellExistingTypes.join(", ")}
              </p>
            ) : (
              <>
                <div className="mt-4 grid max-h-[60vh] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
                  {(machineTypeOptions[activeTab] ?? []).map((type: PreventiveType) => {
                    const checked = activeCellPendingTypes.has(type);
                    const typeData = preventiveTypes.find((t) => t.abbreviation === type);
                    return (
                      <label
                        key={type}
                        className="flex items-start gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-white/[0.03]"
                        title={typeData?.parameter ?? type}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleActiveCellType(type)}
                          className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                        />
                        <span className="min-w-0">
                          <span className="font-medium text-gray-800 dark:text-white">{type}</span>
                          <span className="block truncate text-xs text-gray-400 dark:text-gray-500">
                            {typeData?.parameter ?? type}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                <div className="mt-5 flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setActiveCell(null)}>
                    Done
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
