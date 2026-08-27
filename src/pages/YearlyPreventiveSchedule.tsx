import { useEffect, useMemo, useState } from "react";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import ComponentCard from "../components/common/ComponentCard";
import PageMeta from "../components/common/PageMeta";
import Button from "../components/ui/button/Button";
import Badge from "../components/ui/badge/Badge";
import {
  machineTypeOptions,
  type MachineSub,
  type PlannedPreventive,
  type PreventiveType,
  writeScheduledPlans,
} from "../data/preventiveMaintenanceData";
import {
  createSchedulePlan,
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
  canScheduleYearlyPlan,
  getCurrentUser,
  isManager,
} from "../auth/auth";
import { createApprovedOrder } from "../services/pmoApi";

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

type SortColumn = "machine" | "asset" | "location";
type SortDirection = "asc" | "desc";
type ScheduledSortColumn = "asset" | "sub" | "month" | "week" | "type" | "status";

export default function YearlyPreventiveSchedule() {
  const [selectedSub, setSelectedSub] = useState<MachineSub>("UTY");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(0);
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [plans, setPlans] = useState<PlannedPreventive[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<Record<string, PreventiveType[]>>({});
  const [machineRecords, setMachineRecords] = useState<MachineRecord[]>([]);
  const [isLoadingMachines, setIsLoadingMachines] = useState(true);
  const [sortColumn, setSortColumn] = useState<SortColumn>("machine");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [searchText, setSearchText] = useState("");
  const [currentMachinesPage, setCurrentMachinesPage] = useState(1);
  const MACHINES_PAGE_SIZE = 15;
  const [preventiveTypes, setPreventiveTypes] = useState<
    Array<{ id: number; abbreviation: string; parameter: string }>
  >([]);

  // Scheduled entries filters
  const [scheduledSubFilter, setScheduledSubFilter] = useState<MachineSub | "All">("All");
  const [scheduledMonthFilter, setScheduledMonthFilter] = useState<number | "All">("All");
  const [scheduledWeekFilter, setScheduledWeekFilter] = useState<number | "All">("All");
  const [scheduledTypeFilter, setScheduledTypeFilter] = useState<PreventiveType | "All">("All");
  const [scheduledStatusFilter, setScheduledStatusFilter] = useState<
    "Draft" | "Approved by Engineering" | "Approved by Manager" | "All"
  >("All");
  const [scheduledSearchText, setScheduledSearchText] = useState("");
  const [showApprovedByManager, setShowApprovedByManager] = useState(true);
  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(new Set());
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
        setIsLoadingMachines(true);
        const machines = await fetchMachines();
        setMachineRecords(machines);
      } catch (error) {
        console.error("Failed to load machines from backend, using fallback data:", error);
        setMachineRecords([]);
      } finally {
        setIsLoadingMachines(false);
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
          approvedByManagerUser: plan.approved_by_manager_user || null,
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
        // Only used for showing each type's parameter description; the per-sub checkbox lists stay fixed.
        setPreventiveTypes(types);
      } catch (error) {
        console.error("Failed to load preventive types from backend, using fallback data:", error);
      }
    };

    void loadPreventiveTypes();
  }, []);

  const normalizedMachinesForSub = useMemo(() => {
    const backendMachines = machineRecords.filter((machine) => machine.kategori === selectedSub);

    return backendMachines.map((machine) => ({
      machineId: String(machine.no),
      assetNumber: machine.kode_mesin,
      machineName: machine.nama_mesin,
      department: machine.departemen || "Unassigned",
      location: machine.lokasi,
    }));
  }, [machineRecords, selectedSub]);

  // The preventive_types table stores codes in `parameter` and full names in `abbreviation`
  const typeLabelByCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const type of preventiveTypes) {
      map.set(type.parameter, type.abbreviation);
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

  // Year filter includes years with saved schedules plus a forward-looking window so
  // upcoming years can always be planned ahead of time, even before any plan exists yet.
  const YEARS_AHEAD_TO_PLAN = 5;
  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years = new Set(plans.map((plan) => plan.year).filter(Boolean));
    for (let year = currentYear; year <= currentYear + YEARS_AHEAD_TO_PLAN; year += 1) {
      years.add(year);
    }
    // Guard against a selected year (e.g. restored from a saved plan) that falls outside the window
    years.add(selectedYear);
    return Array.from(years).sort((a, b) => a - b);
  }, [plans, selectedYear]);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const machinesForSub = useMemo(() => {
    let filtered = normalizedMachinesForSub;

    if (searchText.trim()) {
      const searchLower = searchText.toLowerCase();
      filtered = filtered.filter(
        (machine) =>
          machine.machineName.toLowerCase().includes(searchLower) ||
          machine.assetNumber.toLowerCase().includes(searchLower) ||
          (machine.location?.toLowerCase().includes(searchLower) ?? false),
      );
    }

    const sorted = [...filtered].sort((a, b) => {
      let aVal: string = "";
      let bVal: string = "";

      if (sortColumn === "machine") {
        aVal = a.machineName;
        bVal = b.machineName;
      } else if (sortColumn === "asset") {
        aVal = a.assetNumber;
        bVal = b.assetNumber;
      } else if (sortColumn === "location") {
        aVal = a.location ?? "";
        bVal = b.location ?? "";
      }

      const comparison = aVal.localeCompare(bVal);
      return sortDirection === "asc" ? comparison : -comparison;
    });

    return sorted;
  }, [normalizedMachinesForSub, searchText, sortColumn, sortDirection]);

  // Reset to page 1 whenever the filtered/sorted machine list changes underneath the table
  useEffect(() => {
    setCurrentMachinesPage(1);
  }, [selectedSub, searchText, sortColumn, sortDirection]);

  const machinesPageCount = Math.max(1, Math.ceil(machinesForSub.length / MACHINES_PAGE_SIZE));

  useEffect(() => {
    setCurrentMachinesPage((page) => Math.min(page, machinesPageCount));
  }, [machinesPageCount]);

  const paginatedMachinesForSub = useMemo(() => {
    const start = (currentMachinesPage - 1) * MACHINES_PAGE_SIZE;
    return machinesForSub.slice(start, start + MACHINES_PAGE_SIZE);
  }, [machinesForSub, currentMachinesPage]);

  const scheduleForSelectedYear = useMemo(
    () => displayPlans.filter((plan) => plan.year === selectedYear && plan.sub === selectedSub),
    [displayPlans, selectedYear, selectedSub],
  );

  const toggleType = (machineId: string, type: PreventiveType) => {
    setSelectedTypes((prev) => {
      const existing = prev[machineId] ?? [];
      const updated = existing.includes(type)
        ? existing.filter((item) => item !== type)
        : [...existing, type];

      return {
        ...prev,
        [machineId]: updated,
      };
    });
  };

  const toggleSelectAll = () => {
    const allTypes = machineTypeOptions[selectedSub] ?? [];
    const allMachinesHaveAllTypes = machinesForSub.every((machine) => {
      const selectedForMachine = selectedTypes[machine.machineId] ?? [];
      return allTypes.every((type) => selectedForMachine.includes(type));
    });

    const updated: Record<string, PreventiveType[]> = {};
    for (const machine of machinesForSub) {
      if (allMachinesHaveAllTypes) {
        updated[machine.machineId] = [];
      } else {
        updated[machine.machineId] = allTypes;
      }
    }

    setSelectedTypes(updated);
  };

  const toggleSelectAllForType = (type: PreventiveType) => {
    const allMachinesHaveType = machinesForSub.every((machine) => {
      const selectedForMachine = selectedTypes[machine.machineId] ?? [];
      return selectedForMachine.includes(type);
    });

    const updated: Record<string, PreventiveType[]> = { ...selectedTypes };
    for (const machine of machinesForSub) {
      const existing = updated[machine.machineId] ?? [];
      if (allMachinesHaveType) {
        updated[machine.machineId] = existing.filter((t) => t !== type);
      } else {
        if (!existing.includes(type)) {
          updated[machine.machineId] = [...existing, type];
        }
      }
    }

    setSelectedTypes(updated);
  };

  const typeSelectedForAllMachines = useMemo(() => {
    const typeStatus: Record<PreventiveType, boolean> = {};
    const allTypes = machineTypeOptions[selectedSub] ?? [];

    for (const type of allTypes) {
      const allHaveType = machinesForSub.length > 0 && machinesForSub.every((machine) => {
        const selectedForMachine = selectedTypes[machine.machineId] ?? [];
        return selectedForMachine.includes(type);
      });
      typeStatus[type] = allHaveType;
    }

    return typeStatus;
  }, [machinesForSub, selectedTypes, selectedSub]);

  const allMachinesSelected = useMemo(() => {
    const allTypes = machineTypeOptions[selectedSub] ?? [];
    return (
      machinesForSub.length > 0 &&
      machinesForSub.every((machine) => {
        const selectedForMachine = selectedTypes[machine.machineId] ?? [];
        return allTypes.every((type) => selectedForMachine.includes(type));
      })
    );
  }, [machinesForSub, selectedTypes, selectedSub]);

  const saveMonthlyPlan = async () => {
    if (!canScheduleYearlyPlan(currentUser)) {
      alert("Only manager, engineering supervisor, and engineering officer may schedule yearly preventive plans.");
      return;
    }

    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    if (selectedYear < currentYear || (selectedYear === currentYear && selectedMonth < currentMonth)) {
      if (!currentUser || currentUser.role !== "manager") {
        alert("Past-month scheduling is restricted. Only the manager can create a backdated plan.");
        return;
      }
    }

    const selectedEntries: PlannedPreventive[] = [];

    for (const machine of machinesForSub) {
      const chosen = selectedTypes[machine.machineId] ?? [];
      if (!chosen.length) continue;

      const chosenNames = chosen.map((type) => typeLabelByCode.get(type) ?? type);

      const scheduledDate = new Date(selectedYear, selectedMonth, (selectedWeek - 1) * 7 + 1)
        .toISOString()
        .slice(0, 10);

      const mappedMachineId = Number(machine.machineId);

      try {
        const result = await createSchedulePlan({
          machine_no: mappedMachineId,
          machine_asset: machine.assetNumber ?? machine.machineId,
          machine_name: machine.machineName,
          department: machine.department,
          location: machine.location || null,
          sub: selectedSub,
          tahun: selectedYear,
          bulan: selectedMonth,
          minggu: selectedWeek,
          tanggal_jadwal: scheduledDate,
          preventive_types: chosenNames.join(","),
          draft_date: new Date().toISOString(),
          status: "Draft",
          current_role: currentUser?.role,
        });

        const nextPlan: PlannedPreventive = {
          id: String(result.id),
          sub: selectedSub,
          machineId: machine.machineId,
          machineName: machine.machineName,
          department: machine.department,
          year: selectedYear,
          month: selectedMonth,
          week: selectedWeek,
          scheduledDate,
          preventiveTypes: chosenNames,
          status: "Draft",
        };

        selectedEntries.push(nextPlan);
      } catch (error) {
        console.error(`Failed to save schedule for ${machine.machineName}:`, error);
      }
    }

    if (!selectedEntries.length) return;

    const merged = plans.filter(
      (plan) =>
        !(
          plan.sub === selectedSub &&
          plan.year === selectedYear &&
          plan.month === selectedMonth &&
          plan.week === selectedWeek &&
          machinesForSub.some((machine) => machine.machineId === plan.machineId)
        ),
    );

    const updated = [...merged, ...selectedEntries];
    setPlans(updated);
    writeScheduledPlans(updated);
    setSelectedTypes({});
  };

  const removeScheduledPlan = async (entryId: string) => {
    const targetPlan = plans.find((plan) => plan.id === entryId);
    if (targetPlan?.status === "Approved by Manager") {
      alert("This entry has already been approved by the manager and can no longer be deleted.");
      return;
    }

    try {
      const numericId = Number(entryId);
      if (!Number.isNaN(numericId)) {
        await deleteSchedulePlan(numericId);
      }
    } catch (error) {
      console.error("Failed to delete schedule from backend:", error);
    }

    const updated = plans.filter((plan) => plan.id !== entryId);
    setPlans(updated);
    writeScheduledPlans(updated);
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

    const numericId = Number(entry.id);
    if (Number.isNaN(numericId)) return;

    try {
      await updateScheduleStatus(
        numericId,
        "Approved by Engineering",
        {
          machine_name: entry.machineName,
          machine_asset: entry.machineAsset || entry.machineId,
          department: entry.department,
          location: entry.location || null,
          approved_by_engineering_date: new Date().toISOString(),
          approved_by_engineering_user: currentUser?.name || currentUser?.nickname,
        },
        currentUser?.role,
      );

      const updated = plans.map((plan) =>
        plan.id === entry.id
          ? {
              ...plan,
              status: "Approved by Engineering" as const,
              approvedByEngineeringUser: currentUser?.name || currentUser?.nickname || null,
            }
          : plan,
      );
      setPlans(updated);
      writeScheduledPlans(updated);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Engineering approval failed.");
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

    const approvedAt = new Date().toISOString();
    const numericId = Number(entry.id);
    if (Number.isNaN(numericId)) return;

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
          approved_by_manager_user: currentUser?.name || currentUser?.nickname,
        },
        currentUser?.role,
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
        approved_by_manager_user: currentUser?.name || currentUser?.nickname,
      });

      const updated = plans.map((plan) =>
        plan.id === entry.id
          ? {
              ...plan,
              status: "Approved by Manager" as const,
              approvedByManagerUser: currentUser?.name || currentUser?.nickname || null,
            }
          : plan,
      );
      setPlans(updated);
      writeScheduledPlans(updated);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Manager approval failed.");
    }
  };

  const enrichedPlansWithAsset = useMemo(() => {
    return displayPlans.map((plan) => {
      const machine = machineRecords.find((m) => String(m.no) === plan.machineId);
      return {
        ...plan,
        assetNumber: machine?.kode_mesin || plan.machineId,
      };
    });
  }, [displayPlans, machineRecords]);

  const filteredScheduledEntries = useMemo(() => {
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

    if (scheduledStatusFilter !== "All") {
      filtered = filtered.filter((plan) => plan.status === scheduledStatusFilter);
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
          (plan as any).assetNumber?.toLowerCase().includes(searchLower) ||
          plan.department?.toLowerCase().includes(searchLower),
      );
    }

    const sorted = [...filtered].sort((a, b) => {
      let comparison = 0;
      if (scheduledSortColumn === "asset") {
        comparison = String((a as any).assetNumber || a.machineId).localeCompare(String((b as any).assetNumber || b.machineId));
      } else if (scheduledSortColumn === "sub") {
        comparison = a.sub.localeCompare(b.sub);
      } else if (scheduledSortColumn === "month") {
        comparison = a.month - b.month;
      } else if (scheduledSortColumn === "week") {
        comparison = a.week - b.week;
      } else if (scheduledSortColumn === "type") {
        comparison = a.preventiveTypes.join(",").localeCompare(b.preventiveTypes.join(","));
      } else if (scheduledSortColumn === "status") {
        comparison = a.status.localeCompare(b.status);
      }
      return scheduledSortDirection === "asc" ? comparison : -comparison;
    });

    return sorted;
  }, [
    enrichedPlansWithAsset,
    selectedYear,
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

  // Entries locked because a manager has already approved them - excluded from bulk selection entirely
  const selectableScheduledEntries = useMemo(
    () => filteredScheduledEntries.filter((entry) => entry.status !== "Approved by Manager"),
    [filteredScheduledEntries],
  );

  const toggleSelectEntry = (entryId: string) => {
    const targetPlan = plans.find((plan) => plan.id === entryId);
    if (targetPlan?.status === "Approved by Manager") {
      // Locked - already approved by manager, cannot be selected for bulk actions
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
    // Bulk approval only ever applies to entries still in Draft or Approved by Engineering status;
    // anything already Approved by Manager is excluded upstream via selectableScheduledEntries.
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
    // Bulk delete can never remove an entry that's already been approved by the manager
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
  };

  return (
    <>
      <PageMeta
        title="Yearly Preventive Schedule"
        description="Annual preventive schedule planning and tracking"
      />
      <PageBreadcrumb pageTitle="Yearly Preventive Schedule" />

      <div className="space-y-6">
        <ComponentCard title="Yearly Planning Controls">
          <div className="grid gap-4 md:grid-cols-4">
            <label className="text-sm text-gray-700 dark:text-gray-300">
              <span className="mb-2 block">Year</span>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm text-gray-700 dark:text-gray-300">
              <span className="mb-2 block">Group</span>
              <select
                value={selectedSub}
                onChange={(e) => setSelectedSub(e.target.value as MachineSub)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              >
                <option value="MTC">MTC</option>
                <option value="UTY">UTY</option>
                <option value="BLD">BLD</option>
              </select>
            </label>

            <label className="text-sm text-gray-700 dark:text-gray-300">
              <span className="mb-2 block">Month</span>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              >
                {monthNames.map((month, index) => (
                  <option key={month} value={index}>
                    {month}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm text-gray-700 dark:text-gray-300">
              <span className="mb-2 block">Week</span>
              <select
                value={selectedWeek}
                onChange={(e) => setSelectedWeek(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              >
                {[1, 2, 3, 4, 5].map((week) => (
                  <option key={week} value={week}>
                    Week {week}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/40">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {selectedSub} machines to schedule
              </h3>
              <Button onClick={saveMonthlyPlan}>Save Monthly Plan</Button>
            </div>

            <div className="mb-4 flex gap-3">
              <input
                type="text"
                placeholder="Search by machine name, asset number, or location..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none placeholder:text-gray-500 focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-400"
              />
            </div>

            {isLoadingMachines ? (
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
                <div className="animate-pulse divide-y divide-gray-100 dark:divide-white/[0.05]">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 px-4 py-3">
                      <div className="h-4 w-32 rounded bg-gray-200 dark:bg-gray-700" />
                      <div className="h-4 w-20 rounded bg-gray-200 dark:bg-gray-700" />
                      <div className="h-4 w-24 rounded bg-gray-200 dark:bg-gray-700" />
                      <div className="ml-auto flex gap-2">
                        {Array.from({ length: 5 }).map((__, j) => (
                          <div key={j} className="h-4 w-4 rounded bg-gray-200 dark:bg-gray-700" />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div
                  className="overflow-auto rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"
                  style={{ maxHeight: "460px" }}
                >
              <table className="min-w-full border-separate border-spacing-0 text-left">
                <thead className="bg-gray-50 dark:bg-gray-800/60">
                  <tr>
                    <th className="sticky left-0 top-0 z-30 w-48 min-w-[12rem] border-b border-r border-gray-200 bg-gray-50 px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-700 dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-200">
                      <button
                        onClick={() => handleSort("machine")}
                        className="flex cursor-pointer items-center gap-2 hover:text-brand-600"
                      >
                        <input
                          type="checkbox"
                          checked={allMachinesSelected}
                          onChange={toggleSelectAll}
                          className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                          title="Select all machines"
                        />
                        <span>Machine</span>
                        <span className="ml-1 text-xs">
                          {sortColumn === "machine" && (sortDirection === "asc" ? "↑" : "↓")}
                        </span>
                      </button>
                    </th>
                    <>
                      <th className="sticky left-48 top-0 z-30 w-24 min-w-[6rem] border-b border-r border-gray-200 bg-gray-50 px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-700 dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-200">
                        <button
                          onClick={() => handleSort("asset")}
                          className="flex cursor-pointer items-center gap-2 hover:text-brand-600"
                        >
                          <span>Asset Number</span>
                          <span className="ml-1 text-xs">
                            {sortColumn === "asset" && (sortDirection === "asc" ? "↑" : "↓")}
                          </span>
                        </button>
                      </th>
                      <th className="sticky top-0 z-20 border-b border-r border-gray-200 bg-gray-50 px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-700 dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-200">
                        <button
                          onClick={() => handleSort("location")}
                          className="flex cursor-pointer items-center gap-2 hover:text-brand-600"
                        >
                          <span>Location</span>
                          <span className="ml-1 text-xs">
                            {sortColumn === "location" && (sortDirection === "asc" ? "↑" : "↓")}
                          </span>
                        </button>
                      </th>
                    </>
                    {(machineTypeOptions[selectedSub] ?? []).map((type) => {
                      const typeData = preventiveTypes.find((t) => t.abbreviation === type);
                      const isTypeSelectedForAll = typeSelectedForAllMachines[type] ?? false;
                      return (
                        <th
                          key={type}
                          className="sticky top-0 z-20 border-b border-r border-gray-200 bg-gray-50 px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-700 dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-200"
                          title={typeData?.parameter}
                        >
                          <div className="mb-1 flex cursor-pointer items-center justify-center">
                            <input
                              type="checkbox"
                              checked={isTypeSelectedForAll}
                              onChange={() => toggleSelectAllForType(type)}
                              className="h-3 w-3 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                              title={`Select ${type} for all machines`}
                            />
                          </div>
                          <div>{type}</div>
                          {typeData && (
                            <div className="text-[9px] font-normal normal-case text-gray-600 dark:text-gray-400">
                              {typeData.parameter}
                            </div>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {paginatedMachinesForSub.map((machine) => (
                    <tr key={machine.machineId} className="align-middle">
                      <td className="sticky left-0 z-10 w-48 min-w-[12rem] border-b border-r border-gray-200 bg-white px-3 py-3 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
                        <div className="font-medium">{machine.machineName}</div>
                        <div className="text-[11px] text-gray-500 dark:text-gray-400">{machine.machineId}</div>
                      </td>

                      <>
                        <td className="sticky left-48 z-10 w-24 min-w-[6rem] border-b border-r border-gray-200 bg-white px-3 py-3 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
                          {machine.assetNumber ?? machine.machineId}
                        </td>
                        <td className="border-b border-r border-gray-200 bg-white px-3 py-3 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
                          {machine.location ?? machine.department ?? "-"}
                        </td>
                      </>

                      {(machineTypeOptions[selectedSub] ?? []).map((type) => {
                        const selected = selectedTypes[machine.machineId]?.includes(type);
                        return (
                          <td
                            key={`${machine.machineId}-${type}`}
                            className="border-b border-r border-gray-200 px-3 py-3 text-center dark:border-gray-700"
                          >
                            <input
                              type="checkbox"
                              checked={Boolean(selected)}
                              onChange={() => toggleType(machine.machineId, type)}
                              className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
                </div>

                <div className="mt-3 flex flex-col items-center justify-between gap-2 sm:flex-row">
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {machinesForSub.length === 0
                      ? "No machines found"
                      : `Showing ${(currentMachinesPage - 1) * MACHINES_PAGE_SIZE + 1}-${Math.min(
                          currentMachinesPage * MACHINES_PAGE_SIZE,
                          machinesForSub.length,
                        )} of ${machinesForSub.length} machines`}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCurrentMachinesPage((page) => Math.max(1, page - 1))}
                      disabled={currentMachinesPage <= 1}
                    >
                      Previous
                    </Button>
                    <span className="text-xs text-gray-600 dark:text-gray-300">
                      Page {currentMachinesPage} of {machinesPageCount}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCurrentMachinesPage((page) => Math.min(machinesPageCount, page + 1))}
                      disabled={currentMachinesPage >= machinesPageCount}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </ComponentCard>

        <ComponentCard title="Parameter Abbreviation Legend">
          <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            {preventiveTypes
              .slice()
              .sort((a, b) => a.abbreviation.localeCompare(b.abbreviation))
              .map((t) => (
                <div
                  key={t.id}
                  className="flex items-baseline gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm dark:border-white/[0.05] dark:bg-white/[0.02]"
                >
                  <span className="shrink-0 font-semibold text-gray-800 dark:text-white">
                    {t.parameter}
                  </span>
                  <span className="text-gray-500 dark:text-gray-400">-</span>
                  <span className="text-gray-600 dark:text-gray-300">{t.abbreviation}</span>
                </div>
              ))}
          </div>
        </ComponentCard>

        <ComponentCard title={`Calendar View - ${selectedSub} / ${selectedYear}`}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {monthNames.map((month, index) => {
              const monthPlans = scheduleForSelectedYear.filter((plan) => plan.month === index);

              return (
                <div
                  key={month}
                  className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-white/[0.02]"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="font-semibold text-gray-800 dark:text-white">{month}</h4>
                    <span className="rounded-full bg-brand-50 px-2 py-1 text-[10px] font-medium text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
                      {monthPlans.length} scheduled
                    </span>
                  </div>

                  <div className="overflow-y-auto rounded-lg bg-gray-50 p-2 dark:bg-gray-800/30" style={{ maxHeight: "280px" }}>
                    <div className="space-y-2">
                      {[1, 2, 3, 4, 5].map((week) => {
                        const weekPlans = monthPlans.filter((plan) => plan.week === week);
                        return (
                          <div
                            key={`${month}-week-${week}`}
                            className="rounded-lg border border-dashed border-gray-200 p-2 dark:border-gray-700"
                          >
                            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                              Week {week}
                            </div>
                            {weekPlans.length ? (
                              <div className="space-y-1">
                                {weekPlans.map((plan) => (
                                  <div key={plan.id} className="rounded bg-gray-100 px-2 py-1 text-[11px] text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                                    {plan.machineName} ({plan.preventiveTypes.join(" + ")})
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-[11px] text-gray-400">No planned task</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ComponentCard>

        <ComponentCard title="Scheduled Preventive Entries">
          <div className="mb-6 space-y-4">
            <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-7">
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
                    <option key={type.abbreviation} value={type.abbreviation}>
                      {type.abbreviation}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-gray-700 dark:text-gray-300">
                <span className="mb-2 block text-xs font-semibold">Status</span>
                <select
                  value={scheduledStatusFilter}
                  onChange={(e) => setScheduledStatusFilter(e.target.value as typeof scheduledStatusFilter)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                >
                  <option value="All">All Status</option>
                  <option value="Draft">Draft</option>
                  <option value="Approved by Engineering">Approved by Engineering</option>
                  <option value="Approved by Manager">Approved by Manager</option>
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
                <span className="text-xs font-semibold">Show approved by manager</span>
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
                  {filteredScheduledEntries.map((entry: any) => (
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
                            entry.status === "Approved by Manager"
                              ? "success"
                              : entry.status === "Approved by Engineering"
                                ? "primary"
                                : "warning"
                          }
                        >
                          {entry.status}
                        </Badge>
                        {(entry.approvedByEngineeringUser || entry.approvedByManagerUser) && (
                          <div className="mt-1 space-y-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                            {entry.approvedByEngineeringUser && (
                              <div>Engineering: {entry.approvedByEngineeringUser}</div>
                            )}
                            {entry.approvedByManagerUser && (
                              <div>Manager: {entry.approvedByManagerUser}</div>
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
                              <Button size="sm" onClick={() => void approveEngineering(entry)}>
                                Engineering Approval
                              </Button>
                            )}
                            {entry.status === "Approved by Engineering" && isManager(currentUser) && (
                              <Button size="sm" onClick={() => void approveForPmo(entry)}>
                                Manager Approval & Send
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => removeScheduledPlan(entry.id)}
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
          </div>
        </ComponentCard>
      </div>
    </>
  );
}
