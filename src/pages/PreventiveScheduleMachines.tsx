import { useEffect, useMemo, useState } from "react";
import { invalidateScheduleData } from "../hooks/useScheduleData";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import ComponentCard from "../components/common/ComponentCard";
import PageMeta from "../components/common/PageMeta";
import Button from "../components/ui/button/Button";
import {
  machineTypeOptions,
  type MachineSub,
  type PlannedPreventive,
  type PreventiveType,
  writeScheduledPlans,
} from "../data/preventiveMaintenanceData";
import {
  createSchedulePlan,
  fetchMachines,
  fetchPreventiveTypes,
  fetchSchedules,
  type MachineRecord,
  type ScheduleRecord,
} from "../services/pmoApi";
import { canScheduleYearlyPlan, getCurrentUser } from "../auth/auth";

/**
 * Preventive Schedule Assignment > Machines to Schedule.
 *
 * First of three sibling pages this used to be one page with (the other two
 * are Calendar & Matrix View and Scheduled Preventive Entries). This one
 * owns picking a Year/Group/Month/Week, choosing which preventive types to
 * schedule for which machines, and saving that as a batch of Draft schedule
 * entries - plus the Parameter Abbreviation Legend, since that's read
 * directly alongside the type checkboxes above it.
 *
 * Fetches its own copy of machines/schedules/preventive types on mount,
 * same as every other page in this app - the Scheduled Preventive Entries
 * and Calendar & Matrix View pages do the same independently, so an action
 * taken here (or there) is picked up correctly next time each page mounts.
 */

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type SortColumn = "machine" | "asset" | "location";
type SortDirection = "asc" | "desc";

export default function PreventiveScheduleMachines() {
  const [selectedSub, setSelectedSub] = useState<MachineSub>("UTY");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedWeek, setSelectedWeek] = useState(Math.min(5, Math.ceil(new Date().getDate() / 7)));
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
  const currentUser = getCurrentUser();

  useEffect(() => {
    const loadMachines = async () => {
      try {
        setIsLoadingMachines(true);
        const machines = await fetchMachines();
        setMachineRecords(machines);
      } catch (error) {
        console.error("Failed to load machines from backend:", error);
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

  // Converts a plan's stored short code (e.g. "S") to its full descriptive
  // name (e.g. "Service") for display. Requires the
  // 20260904_fix_preventive_types_column_swap.sql migration: abbreviation
  // must hold the short code and parameter must hold the full name.
  const typeLabelByCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const type of preventiveTypes) {
      map.set(type.abbreviation, type.parameter);
    }
    return map;
  }, [preventiveTypes]);

  // Year filter includes years with saved schedules plus a forward-looking window so
  // upcoming years can always be planned ahead of time, even before any plan exists yet.
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
      updated[machine.machineId] = allMachinesHaveAllTypes ? [] : allTypes;
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
      } else if (!existing.includes(type)) {
        updated[machine.machineId] = [...existing, type];
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

      // IMPORTANT: extract the date using local getters, not
      // toISOString().slice(0,10) - new Date(year, month, day) correctly
      // builds LOCAL midnight for the intended date, but toISOString()
      // converts that to UTC before slicing, which silently shifts the
      // saved date back a day for any timezone ahead of UTC (e.g. Jakarta,
      // UTC+7).
      const scheduledDateObj = new Date(selectedYear, selectedMonth, (selectedWeek - 1) * 7 + 1);
      const scheduledDate = `${scheduledDateObj.getFullYear()}-${String(scheduledDateObj.getMonth() + 1).padStart(2, "0")}-${String(scheduledDateObj.getDate()).padStart(2, "0")}`;

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

        selectedEntries.push({
          id: String(result.id),
          sub: selectedSub,
          machineId: machine.machineId,
          machineAsset: machine.assetNumber ?? machine.machineId,
          machineName: machine.machineName,
          department: machine.department,
          location: machine.location || null,
          year: selectedYear,
          month: selectedMonth,
          week: selectedWeek,
          scheduledDate,
          preventiveTypes: chosenNames,
          status: "Draft",
        });
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
    invalidateScheduleData();
  };

  return (
    <>
      <PageMeta
        // title="Machines to Schedule"
        description="Choose preventive types per machine and save a monthly plan"
      />
      <PageBreadcrumb pageTitle="Machines to Schedule" />

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
                  className="resize-y overflow-x-hidden overflow-y-auto rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"
                  style={{ height: "460px", minHeight: "220px", maxHeight: "80vh" }}
                >
                  <table className="w-full table-fixed border-separate border-spacing-0 text-left">
                    <thead className="bg-gray-50 dark:bg-gray-800/60">
                      <tr>
                        <th className="sticky top-0 z-30 w-32 border-b border-r border-gray-200 bg-gray-50 px-2 py-3 text-xs font-semibold uppercase tracking-wide text-gray-700 dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-200">
                          <button
                            onClick={() => handleSort("machine")}
                            className="flex cursor-pointer items-center gap-1 hover:text-brand-600"
                          >
                            <input
                              type="checkbox"
                              checked={allMachinesSelected}
                              onChange={toggleSelectAll}
                              className="h-4 w-4 shrink-0 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                              title="Select all machines"
                            />
                            <span>Machine</span>
                            <span className="ml-1 text-xs">
                              {sortColumn === "machine" && (sortDirection === "asc" ? "↑" : "↓")}
                            </span>
                          </button>
                        </th>
                        <th className="sticky top-0 z-30 w-20 border-b border-r border-gray-200 bg-gray-50 px-2 py-3 text-xs font-semibold uppercase tracking-wide text-gray-700 dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-200">
                          <button
                            onClick={() => handleSort("asset")}
                            className="flex cursor-pointer items-center gap-1 hover:text-brand-600"
                          >
                            <span>Asset #</span>
                            <span className="ml-1 text-xs">
                              {sortColumn === "asset" && (sortDirection === "asc" ? "↑" : "↓")}
                            </span>
                          </button>
                        </th>
                        <th className="sticky top-0 z-20 w-28 border-b border-r border-gray-200 bg-gray-50 px-2 py-3 text-xs font-semibold uppercase tracking-wide text-gray-700 dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-200">
                          <button
                            onClick={() => handleSort("location")}
                            className="flex cursor-pointer items-center gap-1 hover:text-brand-600"
                          >
                            <span>Location</span>
                            <span className="ml-1 text-xs">
                              {sortColumn === "location" && (sortDirection === "asc" ? "↑" : "↓")}
                            </span>
                          </button>
                        </th>
                        {(machineTypeOptions[selectedSub] ?? []).map((type) => {
                          const typeData = preventiveTypes.find((t) => t.abbreviation === type);
                          const isTypeSelectedForAll = typeSelectedForAllMachines[type] ?? false;
                          return (
                            <th
                              key={type}
                              className="sticky top-0 z-20 border-b border-r border-gray-200 bg-gray-50 px-1 py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-gray-700 dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-200"
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
                              <div className="truncate">{type}</div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedMachinesForSub.map((machine) => (
                        <tr key={machine.machineId} className="align-middle">
                          <td className="w-32 border-b border-r border-gray-200 bg-white px-2 py-3 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
                            <div className="break-words font-medium">{machine.machineName}</div>
                            <div className="break-words text-[11px] text-gray-500 dark:text-gray-400">{machine.machineId}</div>
                          </td>
                          <td className="w-20 border-b border-r border-gray-200 bg-white px-2 py-3 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
                            {machine.assetNumber ?? machine.machineId}
                          </td>
                          <td className="w-28 border-b border-r border-gray-200 bg-white px-2 py-3 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
                            {machine.location ?? machine.department ?? "-"}
                          </td>
                          {(machineTypeOptions[selectedSub] ?? []).map((type) => {
                            const selected = selectedTypes[machine.machineId]?.includes(type);
                            return (
                              <td
                                key={`${machine.machineId}-${type}`}
                                className="border-b border-r border-gray-200 px-1 py-3 text-center dark:border-gray-700"
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
                <p className="mt-1 text-right text-[11px] text-gray-400 dark:text-gray-500">
                  ⋰ Drag the bottom-right corner of the table to resize it
                </p>

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
                    {t.abbreviation}
                  </span>
                  <span className="text-gray-500 dark:text-gray-400">-</span>
                  <span className="text-gray-600 dark:text-gray-300">{t.parameter}</span>
                </div>
              ))}
          </div>
        </ComponentCard>
      </div>
    </>
  );
}
