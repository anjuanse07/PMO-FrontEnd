import { useEffect, useMemo, useState } from "react";
import { useApprovedOrders, invalidateScheduleData } from "../hooks/useScheduleData";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import ComponentCard from "../components/common/ComponentCard";
import PageMeta from "../components/common/PageMeta";
import Button from "../components/ui/button/Button";
import Badge from "../components/ui/badge/Badge";
import {
  type MachineSub,
  type PlannedPreventive,
  type PreventiveType,
  writeScheduledPlans,
} from "../data/preventiveMaintenanceData";
import {
  createApprovedOrder,
  deleteSchedulePlan,
  fetchMachines,
  fetchPreventiveTypes,
  fetchSchedules,
  type MachineRecord,
  type ScheduleRecord,
  updateScheduleStatus,
} from "../services/pmoApi";
import {
  canApproveEngineering,
  getCurrentUser,
  isManager,
} from "../auth/auth";

/**
 * Preventive Schedule Assignment > Scheduled Preventive Entries.
 *
 * Third of three sibling pages this used to be one page with (the other
 * two are Machines to Schedule and Calendar & Matrix View). This one owns
 * everything about entries that already exist: filtering/searching them,
 * the status tab bar, engineering/manager approval, deletion, and bulk
 * versions of both.
 *
 * Fetches its own copy of machines/schedules/preventive types on mount,
 * same as the other two pages - each independently fetching means an
 * action taken on one page (e.g. creating a schedule on Machines to
 * Schedule) is correctly reflected here next time this page mounts.
 */

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type SortDirection = "asc" | "desc";
type ScheduledSortColumn = "asset" | "sub" | "month" | "week" | "type" | "status";

// A schedule entry's raw status only ever reaches "Approved by Manager" -
// once approved, a linked Approved Order is created and it's that order's
// own status that later becomes "Completed" (see YearlyScheduleMatrix.tsx,
// which does the same schedule/order pairing for the matrix view). This
// derived status folds that "Completed" order-side signal back onto the
// schedule entry so the tab bar below can offer a genuine Completed tab.
type ScheduledStatusFilter =
  | "All"
  | "Draft"
  | "Approved by Engineering"
  | "Approved by Manager"
  | "Completed";

type EnrichedScheduleEntry = PlannedPreventive & {
  assetNumber: string;
  effectiveStatus: ScheduledStatusFilter;
};

const scheduledStatusTabs: { key: ScheduledStatusFilter; label: string; icon: string }[] = [
  { key: "All", label: "All Orders", icon: "📋" },
  { key: "Draft", label: "Draft", icon: "🧑‍💼" },
  { key: "Approved by Engineering", label: "Approved by Engineering", icon: "🛠️" },
  { key: "Approved by Manager", label: "Approved by Manager", icon: "🛠️" },
  { key: "Completed", label: "Completed", icon: "✅" },
];

// Formats an ISO date string down to just the date (no time), matching how
// the Preventive Orders table shows approval dates.
const formatApprovalDate = (isoDate: string | null | undefined): string | null => {
  if (!isoDate) return null;
  const parsed = new Date(isoDate);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toLocaleDateString();
};

export default function PreventiveScheduleEntries() {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [plans, setPlans] = useState<PlannedPreventive[]>([]);
  const [machineRecords, setMachineRecords] = useState<MachineRecord[]>([]);
  const [preventiveTypes, setPreventiveTypes] = useState<
    Array<{ id: number; abbreviation: string; parameter: string }>
  >([]);
  // Read-only here (never locally mutated), so safe to source from the
  // shared cache. Unscoped ("All" years) since yearOptions needs to see
  // every year that has ever had data.
  const { orders: approvedOrders } = useApprovedOrders("All");

  const [scheduledSubFilter, setScheduledSubFilter] = useState<MachineSub | "All">("All");
  const [scheduledMonthFilter, setScheduledMonthFilter] = useState<number | "All">("All");
  const [scheduledWeekFilter, setScheduledWeekFilter] = useState<number | "All">("All");
  const [scheduledTypeFilter, setScheduledTypeFilter] = useState<PreventiveType | "All">("All");
  const [scheduledStatusFilter, setScheduledStatusFilter] = useState<ScheduledStatusFilter>("All");
  const [scheduledSearchText, setScheduledSearchText] = useState("");
  // Defaults to false so entries already Approved by Manager (and their
  // "Completed" descendants, see effectiveStatus above) are automatically
  // hidden - the checkbox below still lets the user opt back in.
  const [showApprovedByManager, setShowApprovedByManager] = useState(false);
  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(new Set());
  // Tracks entries with an approve/delete request currently in flight, so
  // the corresponding button can be disabled - without this, a double-click
  // (or a slow network round-trip + an impatient second click) can fire the
  // same mutation twice. The first succeeds; the second then gets rejected
  // by the backend's own status check (since by then the entry has already
  // moved past the state the second request still thinks it's in), which
  // is confusing since the UI hasn't caught up yet to show why.
  const [entriesInFlight, setEntriesInFlight] = useState<Set<string>>(new Set());
  const [scheduledSortColumn, setScheduledSortColumn] = useState<ScheduledSortColumn>("asset");
  const [scheduledSortDirection, setScheduledSortDirection] = useState<SortDirection>("asc");
  const currentUser = getCurrentUser();

  const handleScheduledSort = (column: ScheduledSortColumn) => {
    if (scheduledSortColumn === column) {
      setScheduledSortDirection(scheduledSortDirection === "asc" ? "desc" : "asc");
    } else {
      setScheduledSortColumn(column);
      setScheduledSortDirection("asc");
    }
  };

  useEffect(() => {
    const loadMachines = async () => {
      try {
        const machines = await fetchMachines();
        setMachineRecords(machines);
      } catch (error) {
        console.error("Failed to load machines from backend:", error);
      }
    };

    void loadMachines();
  }, []);

  useEffect(() => {
    const loadPlans = async () => {
      try {
        const remotePlans = await fetchSchedules();
        const mappedPlans: PlannedPreventive[] = remotePlans.map((plan: ScheduleRecord) => ({
          id: String(plan.id),
          sub: plan.sub,
          machineId: String(plan.machine_no),
          machineAsset: plan.machine_asset ? String(plan.machine_asset) : String(plan.machine_no),
          machineName: plan.machine_name || (plan.machine_no ? `Machine ${plan.machine_no}` : "Unknown"),
          department: plan.department || "Database",
          location: plan.location || null,
          year: plan.tahun,
          month: plan.bulan,
          week: plan.minggu,
          scheduledDate: plan.tanggal_jadwal || `${plan.tahun}-${String(plan.bulan + 1).padStart(2, "0")}-01`,
          preventiveTypes: String(plan.preventive_types).split(",").filter(Boolean) as PreventiveType[],
          status: plan.status,
          approvedByEngineeringUser: plan.approved_by_engineering_user || null,
          approvedByEngineeringDate: plan.approved_by_engineering_date || null,
          approvedByManagerUser: plan.approved_by_manager_user || null,
          approvedByManagerDate: plan.approved_by_manager_date || null,
        }));

        setPlans(mappedPlans);
        writeScheduledPlans(mappedPlans);
      } catch (error) {
        console.error("Failed to load schedules from backend:", error);
      }
    };

    void loadPlans();
  }, []);

  useEffect(() => {
    const loadPreventiveTypes = async () => {
      try {
        const types = await fetchPreventiveTypes();
        setPreventiveTypes(types);
      } catch (error) {
        console.error("Failed to load preventive types from backend:", error);
      }
    };

    void loadPreventiveTypes();
  }, []);

  const typeLabelByCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const type of preventiveTypes) {
      map.set(type.abbreviation, type.parameter);
    }
    return map;
  }, [preventiveTypes]);

  const displayPlans = useMemo(
    () =>
      plans.map((plan) => ({
        ...plan,
        preventiveTypes: plan.preventiveTypes.map((type) => typeLabelByCode.get(type) ?? type),
      })),
    [plans, typeLabelByCode],
  );

  const YEARS_AHEAD_TO_PLAN = 5;
  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years = new Set(plans.map((plan) => plan.year).filter(Boolean));
    for (let year = currentYear; year <= currentYear + YEARS_AHEAD_TO_PLAN; year += 1) {
      years.add(year);
    }
    years.add(selectedYear);
    return Array.from(years).sort((a, b) => a - b);
  }, [plans, selectedYear]);

  const removeScheduledPlan = async (entryId: string) => {
    if (entriesInFlight.has(entryId)) return;

    const targetPlan = plans.find((plan) => plan.id === entryId);
    if (targetPlan?.status === "Approved by Manager") {
      alert("This entry has already been approved by the manager and can no longer be deleted.");
      return;
    }

    setEntriesInFlight((prev) => new Set(prev).add(entryId));
    try {
      const numericId = Number(entryId);
      if (!Number.isNaN(numericId)) {
        await deleteSchedulePlan(numericId);
      }
    } catch (error) {
      console.error("Failed to delete schedule from backend:", error);
    } finally {
      setEntriesInFlight((prev) => {
        const next = new Set(prev);
        next.delete(entryId);
        return next;
      });
    }

    const updated = plans.filter((plan) => plan.id !== entryId);
    setPlans(updated);
    writeScheduledPlans(updated);
    invalidateScheduleData();
  };

  const approveEngineering = async (entry: PlannedPreventive) => {
    if (!canApproveEngineering(currentUser)) {
      alert("Only an engineering supervisor or engineering officer can approve engineering review.");
      return;
    }
    if (entry.status !== "Draft") {
      alert("Only entries still in Draft status can receive engineering approval.");
      return;
    }
    if (entriesInFlight.has(entry.id)) return;

    const numericId = Number(entry.id);
    if (Number.isNaN(numericId)) return;

    setEntriesInFlight((prev) => new Set(prev).add(entry.id));
    const engineeringApprovedAt = new Date().toISOString();
    try {
      await updateScheduleStatus(
        numericId,
        "Approved by Engineering",
        {
          machine_name: entry.machineName,
          machine_asset: entry.machineAsset || entry.machineId,
          department: entry.department,
          location: entry.location || null,
          approved_by_engineering_date: engineeringApprovedAt,
          approved_by_engineering_user: currentUser?.nickname || currentUser?.name,
        },
        currentUser?.role,
        currentUser?.id,
      );

      const updated = plans.map((plan) =>
        plan.id === entry.id
          ? {
              ...plan,
              status: "Approved by Engineering" as const,
              approvedByEngineeringUser: currentUser?.nickname || currentUser?.name || null,
              approvedByEngineeringDate: engineeringApprovedAt,
            }
          : plan,
      );
      setPlans(updated);
      writeScheduledPlans(updated);
      invalidateScheduleData();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Engineering approval failed.");
    } finally {
      setEntriesInFlight((prev) => {
        const next = new Set(prev);
        next.delete(entry.id);
        return next;
      });
    }
  };

  const approveForPmo = async (entry: PlannedPreventive) => {
    if (!isManager(currentUser)) {
      alert("Only the manager can give final approval.");
      return;
    }
    if (entry.status !== "Approved by Engineering") {
      alert("Engineering supervisor approval is required before manager approval.");
      return;
    }
    if (entriesInFlight.has(entry.id)) return;

    const approvedAt = new Date().toISOString();
    const numericId = Number(entry.id);
    if (Number.isNaN(numericId)) return;

    setEntriesInFlight((prev) => new Set(prev).add(entry.id));
    try {
      await updateScheduleStatus(
        numericId,
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

      const updated = plans.map((plan) =>
        plan.id === entry.id
          ? {
              ...plan,
              status: "Approved by Manager" as const,
              approvedByManagerUser: currentUser?.nickname || currentUser?.name || null,
              approvedByManagerDate: approvedAt,
            }
          : plan,
      );
      setPlans(updated);
      writeScheduledPlans(updated);
      invalidateScheduleData();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Manager approval failed.");
    } finally {
      setEntriesInFlight((prev) => {
        const next = new Set(prev);
        next.delete(entry.id);
        return next;
      });
    }
  };

  // machine_no-month-week keys for every Completed Approved Order in the
  // currently selected year - used to upgrade a schedule entry's display
  // status to "Completed" once its linked order has actually been finished
  // (same pairing approach as the matrix view in YearlyScheduleMatrix.tsx).
  const completedOrderKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const order of approvedOrders) {
      if (order.year !== selectedYear || order.status !== "Completed") continue;
      keys.add(`${order.machine_no}-${order.month}-${order.week}`);
    }
    return keys;
  }, [approvedOrders, selectedYear]);

  const enrichedPlansWithAsset = useMemo<EnrichedScheduleEntry[]>(() => {
    return displayPlans.map((plan) => {
      const machine = machineRecords.find((m) => String(m.no) === plan.machineId);
      const effectiveStatus: ScheduledStatusFilter =
        plan.status === "Approved by Manager" && completedOrderKeys.has(`${plan.machineId}-${plan.month}-${plan.week}`)
          ? "Completed"
          : plan.status;
      return {
        ...plan,
        assetNumber: machine?.kode_mesin || plan.machineId,
        effectiveStatus,
      };
    });
  }, [displayPlans, machineRecords, completedOrderKeys]);

  // Every filter except Status/Hide-Completed, shared by both the status tab
  // counts (below) and the final filteredScheduledEntries list, so the two
  // never drift out of sync with each other.
  const baseFilteredScheduledEntries = useMemo(() => {
    let filtered = enrichedPlansWithAsset.filter((plan) => plan.year === selectedYear);

    if (scheduledSubFilter !== "All") {
      filtered = filtered.filter((plan) => plan.sub === scheduledSubFilter);
    }

    if (scheduledMonthFilter !== "All") {
      filtered = filtered.filter((plan) => plan.month === scheduledMonthFilter);
    }

    if (scheduledWeekFilter !== "All") {
      filtered = filtered.filter((plan) => plan.week === scheduledWeekFilter);
    }

    if (scheduledTypeFilter !== "All") {
      filtered = filtered.filter((plan) => plan.preventiveTypes.includes(scheduledTypeFilter));
    }

    if (!showApprovedByManager) {
      filtered = filtered.filter((plan) => plan.status !== "Approved by Manager");
    }

    if (scheduledSearchText.trim()) {
      const searchLower = scheduledSearchText.toLowerCase();
      filtered = filtered.filter(
        (plan) =>
          plan.machineName.toLowerCase().includes(searchLower) ||
          plan.machineId.toLowerCase().includes(searchLower) ||
          plan.assetNumber?.toLowerCase().includes(searchLower) ||
          plan.department?.toLowerCase().includes(searchLower),
      );
    }

    return filtered;
  }, [
    enrichedPlansWithAsset,
    selectedYear,
    scheduledSubFilter,
    scheduledMonthFilter,
    scheduledWeekFilter,
    scheduledTypeFilter,
    showApprovedByManager,
    scheduledSearchText,
  ]);

  const scheduledStatusTabCounts = useMemo(() => {
    const counts: Record<ScheduledStatusFilter, number> = {
      All: 0,
      Draft: 0,
      "Approved by Engineering": 0,
      "Approved by Manager": 0,
      Completed: 0,
    };
    for (const plan of baseFilteredScheduledEntries) {
      counts.All += 1;
      counts[plan.effectiveStatus] += 1;
    }
    return counts;
  }, [baseFilteredScheduledEntries]);

  const filteredScheduledEntries = useMemo(() => {
    const filtered = baseFilteredScheduledEntries.filter(
      (plan) => scheduledStatusFilter === "All" || plan.effectiveStatus === scheduledStatusFilter,
    );

    const sorted = [...filtered].sort((a, b) => {
      let comparison = 0;
      if (scheduledSortColumn === "asset") {
        comparison = String(a.assetNumber || a.machineId).localeCompare(String(b.assetNumber || b.machineId));
      } else if (scheduledSortColumn === "sub") {
        comparison = a.sub.localeCompare(b.sub);
      } else if (scheduledSortColumn === "month") {
        comparison = a.month - b.month;
      } else if (scheduledSortColumn === "week") {
        comparison = a.week - b.week;
      } else if (scheduledSortColumn === "type") {
        comparison = a.preventiveTypes.join(",").localeCompare(b.preventiveTypes.join(","));
      } else if (scheduledSortColumn === "status") {
        comparison = a.effectiveStatus.localeCompare(b.effectiveStatus);
      }
      return scheduledSortDirection === "asc" ? comparison : -comparison;
    });

    return sorted;
  }, [baseFilteredScheduledEntries, scheduledStatusFilter, scheduledSortColumn, scheduledSortDirection]);

  const SCHEDULED_ENTRIES_PAGE_SIZE = 25;
  const [currentScheduledEntriesPage, setCurrentScheduledEntriesPage] = useState(1);

  useEffect(() => {
    setCurrentScheduledEntriesPage(1);
  }, [
    scheduledSubFilter,
    scheduledMonthFilter,
    scheduledWeekFilter,
    scheduledTypeFilter,
    scheduledStatusFilter,
    showApprovedByManager,
    scheduledSearchText,
    scheduledSortColumn,
    scheduledSortDirection,
  ]);

  const scheduledEntriesPageCount = Math.max(1, Math.ceil(filteredScheduledEntries.length / SCHEDULED_ENTRIES_PAGE_SIZE));

  useEffect(() => {
    setCurrentScheduledEntriesPage((page) => Math.min(page, scheduledEntriesPageCount));
  }, [scheduledEntriesPageCount]);

  const paginatedScheduledEntries = useMemo(() => {
    const start = (currentScheduledEntriesPage - 1) * SCHEDULED_ENTRIES_PAGE_SIZE;
    return filteredScheduledEntries.slice(start, start + SCHEDULED_ENTRIES_PAGE_SIZE);
  }, [filteredScheduledEntries, currentScheduledEntriesPage]);

  // Entries locked because a manager has already approved them - excluded from bulk selection entirely
  const selectableScheduledEntries = useMemo(
    () => filteredScheduledEntries.filter((entry) => entry.status !== "Approved by Manager"),
    [filteredScheduledEntries],
  );

  const toggleSelectEntry = (entryId: string) => {
    const targetPlan = plans.find((plan) => plan.id === entryId);
    if (targetPlan?.status === "Approved by Manager") {
      return;
    }

    const updated = new Set(selectedEntryIds);
    if (updated.has(entryId)) {
      updated.delete(entryId);
    } else {
      updated.add(entryId);
    }
    setSelectedEntryIds(updated);
  };

  const toggleSelectAllFilteredEntries = () => {
    if (selectedEntryIds.size === selectableScheduledEntries.length && selectableScheduledEntries.length > 0) {
      setSelectedEntryIds(new Set());
    } else {
      setSelectedEntryIds(new Set(selectableScheduledEntries.map((e) => e.id)));
    }
  };

  const allFilteredEntriesSelected = useMemo(
    () => selectableScheduledEntries.length > 0 && selectedEntryIds.size === selectableScheduledEntries.length,
    [selectableScheduledEntries, selectedEntryIds],
  );

  const bulkApproveEntries = async () => {
    const selectedPlans = plans.filter(
      (plan) => selectedEntryIds.has(plan.id) && plan.status !== "Approved by Manager",
    );

    if (canApproveEngineering(currentUser)) {
      const eligible = selectedPlans.filter((item) => item.status === "Draft");
      if (!eligible.length) {
        alert("No selected entries are eligible for engineering approval (must be in Draft status).");
      }
      for (const plan of eligible) {
        await approveEngineering(plan);
      }
    } else if (isManager(currentUser)) {
      const eligible = selectedPlans.filter((item) => item.status === "Approved by Engineering");
      if (!eligible.length) {
        alert("No selected entries are eligible for manager approval (must be Approved by Engineering).");
      }
      for (const plan of eligible) {
        await approveForPmo(plan);
      }
    } else {
      alert("Your role cannot approve scheduled entries.");
    }

    setSelectedEntryIds(new Set());
  };

  const bulkDeleteEntries = async () => {
    const idsToDelete = Array.from(selectedEntryIds).filter((id) => {
      const plan = plans.find((p) => p.id === id);
      return plan && plan.status !== "Approved by Manager";
    });

    for (const id of idsToDelete) {
      try {
        const numericId = Number(id);
        if (!Number.isNaN(numericId)) {
          await deleteSchedulePlan(numericId);
        }
      } catch (error) {
        console.error(`Failed to delete schedule ${id} from backend:`, error);
      }
    }

    const updatedPlans = plans.filter((plan) => !idsToDelete.includes(plan.id));
    setPlans(updatedPlans);
    writeScheduledPlans(updatedPlans);
    setSelectedEntryIds(new Set());
    invalidateScheduleData();
  };

  return (
    <>
      <PageMeta
        // title="Scheduled Preventive Entries"
        description="Review, approve, and manage scheduled preventive maintenance entries"
      />
      <PageBreadcrumb pageTitle="Scheduled Preventive Entries" />

      <div className="space-y-6">
        <ComponentCard title="Scheduled Preventive Entries">
          <div className="mb-6 space-y-4">
            <div className="flex flex-wrap gap-2 rounded-2xl border border-gray-200 bg-gray-50 p-2 dark:border-gray-800 dark:bg-gray-800/40">
              {scheduledStatusTabs.map((tab) => {
                const isActive = scheduledStatusFilter === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setScheduledStatusFilter(tab.key)}
                    className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                      isActive
                        ? "bg-white text-gray-900 shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:text-white dark:ring-gray-700"
                        : "text-gray-500 hover:bg-white/70 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/[0.04]"
                    }`}
                  >
                    <span aria-hidden="true">{tab.icon}</span>
                    <span>{tab.label}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        isActive
                          ? "bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300"
                          : "bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                      }`}
                    >
                      {scheduledStatusTabCounts[tab.key]}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-7">
              <label className="text-sm text-gray-700 dark:text-gray-300">
                <span className="mb-2 block text-xs font-semibold">Year</span>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                >
                  {yearOptions.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-gray-700 dark:text-gray-300">
                <span className="mb-2 block text-xs font-semibold">Group</span>
                <select
                  value={scheduledSubFilter}
                  onChange={(e) => setScheduledSubFilter(e.target.value as MachineSub | "All")}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                >
                  <option value="All">All Groups</option>
                  <option value="MTC">MTC</option>
                  <option value="UTY">UTY</option>
                  <option value="BLD">BLD</option>
                </select>
              </label>

              <label className="text-sm text-gray-700 dark:text-gray-300">
                <span className="mb-2 block text-xs font-semibold">Month</span>
                <select
                  value={scheduledMonthFilter}
                  onChange={(e) => setScheduledMonthFilter(e.target.value === "All" ? "All" : Number(e.target.value))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                >
                  <option value="All">All Months</option>
                  {monthNames.map((month, idx) => (
                    <option key={idx} value={idx}>
                      {month}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-gray-700 dark:text-gray-300">
                <span className="mb-2 block text-xs font-semibold">Week</span>
                <select
                  value={scheduledWeekFilter}
                  onChange={(e) => setScheduledWeekFilter(e.target.value === "All" ? "All" : Number(e.target.value))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                >
                  <option value="All">All Weeks</option>
                  {[1, 2, 3, 4, 5].map((week) => (
                    <option key={week} value={week}>
                      Week {week}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-gray-700 dark:text-gray-300">
                <span className="mb-2 block text-xs font-semibold">Type</span>
                <select
                  value={scheduledTypeFilter}
                  onChange={(e) => setScheduledTypeFilter(e.target.value as PreventiveType | "All")}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                >
                  <option value="All">All Types</option>
                  {preventiveTypes.map((type) => (
                    <option key={type.abbreviation} value={type.parameter}>
                      {type.parameter}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-gray-700 dark:text-gray-300">
                <span className="mb-2 block text-xs font-semibold">Search</span>
                <input
                  type="text"
                  placeholder="Machine, ID, dept..."
                  value={scheduledSearchText}
                  onChange={(e) => setScheduledSearchText(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none placeholder:text-gray-400 focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </label>

              <label className="flex items-center gap-2 self-end text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={showApprovedByManager}
                  onChange={(e) => setShowApprovedByManager(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="text-xs font-semibold">Show approved by manager / completed</span>
              </label>
            </div>

            {selectedEntryIds.size > 0 && (
              <div className="rounded-lg bg-brand-50 p-3 dark:bg-brand-500/10">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-brand-900 dark:text-brand-200">
                    {selectedEntryIds.size} entry/ies selected
                  </span>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => void bulkApproveEntries()} className="bg-green-600 hover:bg-green-700">
                      {canApproveEngineering(currentUser) ? "Bulk Engineering Approval" : "Bulk Manager Approval"}
                    </Button>
                    <Button size="sm" onClick={bulkDeleteEntries} variant="outline" className="border-red-300 text-red-600 hover:bg-red-50">
                      Bulk Delete
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]" style={{ maxHeight: "500px", display: "flex", flexDirection: "column" }}>
            <div className="flex-1 overflow-y-auto">
              <table className="min-w-full text-left">
                <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800/60">
                  <tr>
                    <th className="px-4 py-3 text-xs font-semibold uppercase text-gray-600 dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={allFilteredEntriesSelected}
                        onChange={toggleSelectAllFilteredEntries}
                        className="rounded border-gray-300"
                      />
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase text-gray-600 dark:text-gray-300">
                      <button onClick={() => handleScheduledSort("asset")} className="flex cursor-pointer items-center gap-2 uppercase hover:text-brand-600">
                        <span>Machine Asset (ID)</span>
                        <span className="ml-1 text-xs">{scheduledSortColumn === "asset" && (scheduledSortDirection === "asc" ? "↑" : "↓")}</span>
                      </button>
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase text-gray-600 dark:text-gray-300">
                      <button onClick={() => handleScheduledSort("sub")} className="flex cursor-pointer items-center gap-2 uppercase hover:text-brand-600">
                        <span>Sub</span>
                        <span className="ml-1 text-xs">{scheduledSortColumn === "sub" && (scheduledSortDirection === "asc" ? "↑" : "↓")}</span>
                      </button>
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase text-gray-600 dark:text-gray-300">
                      <button onClick={() => handleScheduledSort("month")} className="flex cursor-pointer items-center gap-2 uppercase hover:text-brand-600">
                        <span>Month</span>
                        <span className="ml-1 text-xs">{scheduledSortColumn === "month" && (scheduledSortDirection === "asc" ? "↑" : "↓")}</span>
                      </button>
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase text-gray-600 dark:text-gray-300">
                      <button onClick={() => handleScheduledSort("week")} className="flex cursor-pointer items-center gap-2 uppercase hover:text-brand-600">
                        <span>Week</span>
                        <span className="ml-1 text-xs">{scheduledSortColumn === "week" && (scheduledSortDirection === "asc" ? "↑" : "↓")}</span>
                      </button>
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase text-gray-600 dark:text-gray-300">
                      <button onClick={() => handleScheduledSort("type")} className="flex cursor-pointer items-center gap-2 uppercase hover:text-brand-600">
                        <span>Type</span>
                        <span className="ml-1 text-xs">{scheduledSortColumn === "type" && (scheduledSortDirection === "asc" ? "↑" : "↓")}</span>
                      </button>
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase text-gray-600 dark:text-gray-300">
                      <button onClick={() => handleScheduledSort("status")} className="flex cursor-pointer items-center gap-2 uppercase hover:text-brand-600">
                        <span>Status</span>
                        <span className="ml-1 text-xs">{scheduledSortColumn === "status" && (scheduledSortDirection === "asc" ? "↑" : "↓")}</span>
                      </button>
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase text-gray-600 dark:text-gray-300">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                  {paginatedScheduledEntries.map((entry) => (
                    <tr key={entry.id}>
                      <td className="px-4 py-3 text-sm">
                        <input
                          type="checkbox"
                          checked={selectedEntryIds.has(entry.id)}
                          onChange={() => toggleSelectEntry(entry.id)}
                          disabled={entry.status === "Approved by Manager"}
                          title={
                            entry.status === "Approved by Manager"
                              ? "Locked - already approved by manager"
                              : undefined
                          }
                          className="rounded border-gray-300 disabled:cursor-not-allowed disabled:opacity-40"
                        />
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                        <div className="font-medium">{entry.assetNumber || entry.machineId}</div>
                        <div className="text-[11px] text-gray-500 dark:text-gray-400">{entry.machineName}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{entry.sub}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{monthNames[entry.month]}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">Week {entry.week}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                        {entry.preventiveTypes.join(" + ")}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <Badge
                          size="sm"
                          color={
                            entry.effectiveStatus === "Completed" || entry.effectiveStatus === "Approved by Manager"
                              ? "success"
                              : entry.effectiveStatus === "Approved by Engineering"
                                ? "primary"
                                : "warning"
                          }
                        >
                          {entry.effectiveStatus}
                        </Badge>
                        {(entry.approvedByEngineeringUser || entry.approvedByManagerUser) && (
                          <div className="mt-1 space-y-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                            {entry.approvedByEngineeringUser && (
                              <div>
                                Engineering: {entry.approvedByEngineeringUser}
                                {formatApprovalDate(entry.approvedByEngineeringDate)
                                  ? ` (${formatApprovalDate(entry.approvedByEngineeringDate)})`
                                  : ""}
                              </div>
                            )}
                            {entry.approvedByManagerUser && (
                              <div>
                                Manager: {entry.approvedByManagerUser}
                                {formatApprovalDate(entry.approvedByManagerDate)
                                  ? ` (${formatApprovalDate(entry.approvedByManagerDate)})`
                                  : ""}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {entry.status === "Approved by Manager" ? (
                          <span className="text-xs italic text-gray-400 dark:text-gray-500">
                            Locked - approved
                          </span>
                        ) : (
                          <div className="flex items-center gap-2">
                            {entry.status === "Draft" && canApproveEngineering(currentUser) && (
                              <Button
                                size="sm"
                                onClick={() => void approveEngineering(entry)}
                                disabled={entriesInFlight.has(entry.id)}
                              >
                                {entriesInFlight.has(entry.id) ? "..." : "Engineering Approval"}
                              </Button>
                            )}
                            {entry.status === "Approved by Engineering" && isManager(currentUser) && (
                              <Button
                                size="sm"
                                onClick={() => void approveForPmo(entry)}
                                disabled={entriesInFlight.has(entry.id)}
                              >
                                {entriesInFlight.has(entry.id) ? "..." : "Manager Approval & Send"}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void removeScheduledPlan(entry.id)}
                              disabled={entriesInFlight.has(entry.id)}
                            >
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

            <div className="mt-3 flex flex-col items-center justify-between gap-2 px-1 sm:flex-row">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {filteredScheduledEntries.length === 0
                  ? "No entries found"
                  : `Showing ${(currentScheduledEntriesPage - 1) * SCHEDULED_ENTRIES_PAGE_SIZE + 1}-${Math.min(
                      currentScheduledEntriesPage * SCHEDULED_ENTRIES_PAGE_SIZE,
                      filteredScheduledEntries.length,
                    )} of ${filteredScheduledEntries.length} entries`}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCurrentScheduledEntriesPage((page) => Math.max(1, page - 1))}
                  disabled={currentScheduledEntriesPage <= 1}
                >
                  Previous
                </Button>
                <span className="text-xs text-gray-600 dark:text-gray-300">
                  Page {currentScheduledEntriesPage} of {scheduledEntriesPageCount}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setCurrentScheduledEntriesPage((page) => Math.min(scheduledEntriesPageCount, page + 1))
                  }
                  disabled={currentScheduledEntriesPage >= scheduledEntriesPageCount}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        </ComponentCard>
      </div>
    </>
  );
}
