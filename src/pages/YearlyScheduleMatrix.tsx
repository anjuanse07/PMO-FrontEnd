import { useEffect, useMemo, useState } from "react";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import ComponentCard from "../components/common/ComponentCard";
import PageMeta from "../components/common/PageMeta";
import YearlyProgressDashboard from "../components/ecommerce/YearlyProgressDashboard";
import { type MachineSub } from "../data/preventiveMaintenanceData";
import {
  fetchMachines,
  fetchSchedules,
  fetchApprovedOrders,
  type MachineRecord,
  type ScheduleRecord,
  type ApprovedOrderRecord,
} from "../services/pmoApi";

/**
 * NOTE FOR INTEGRATION
 * ---------------------------------------------------------------------------
 * This page reads:
 *  - fetchMachines()        -> Y axis (rows), grouped by machine.kategori
 *  - fetchSchedules()       -> yellow cells (plotted/scheduled preventive types)
 *  - fetchApprovedOrders()  -> green cells (status === "Completed")
 *
 * These are exactly the same schedule + approved-order rows produced by
 * YearlyPreventiveSchedule.tsx's "Manager Approval & Send" action
 * (approveForPmo -> createApprovedOrder with status "In Progress"), which
 * PreventiveMaintenanceOrder.tsx later flips to "Completed". So this page
 * will automatically reflect anything approved/sent from the yearly
 * schedule page, no extra wiring needed on that end.
 *
 * Still needs: registering this page as a route + sidebar link (see chat).
 * ---------------------------------------------------------------------------
 */

const monthAbbrev = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const WEEKS_PER_MONTH = 5;

const subTabs: { key: MachineSub; label: string }[] = [
  { key: "BLD", label: "BLD" },
  { key: "UTY", label: "UTY" },
  { key: "MTC", label: "MTC" },
];

type TabKey = MachineSub | "Dashboard";

type CellStatus = "scheduled" | "completed";

type MatrixCell = {
  types: string[];
  status: CellStatus;
};

type MachineRow = {
  machineId: string;
  assetNumber: string;
  machineName: string;
  location: string | null;
};

const splitTypes = (raw: string | null | undefined): string[] =>
  String(raw ?? "")
    .split(",")
    .map((type) => type.trim())
    .filter(Boolean);

const cellKey = (month: number, week: number) => `${month}-${week}`;

export default function YearlyScheduleMatrix() {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  // Empty array = "Full Year" (every month shown), otherwise the exact set
  // of months to show as matrix columns - lets the user pick a couple of
  // months at once instead of only ever one month or all twelve.
  const [selectedMonths, setSelectedMonths] = useState<number[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>("UTY");
  const [machineRecords, setMachineRecords] = useState<MachineRecord[]>([]);
  const [schedules, setSchedules] = useState<ScheduleRecord[]>([]);
  const [orders, setOrders] = useState<ApprovedOrderRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const MATRIX_ROWS_PAGE_SIZE = 100;
  const [currentMatrixPage, setCurrentMatrixPage] = useState(1);

  useEffect(() => {
    const loadAll = async () => {
      try {
        setIsLoading(true);
        const [machines, scheduleRows, orderRows] = await Promise.all([
          fetchMachines(),
          fetchSchedules(),
          fetchApprovedOrders(),
        ]);
        setMachineRecords(machines);
        setSchedules(scheduleRows);
        setOrders(orderRows);
      } catch (error) {
        console.error("Failed to load yearly schedule matrix data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    void loadAll();
  }, []);

  // Year filter reflects whatever years actually have schedule or order data,
  // plus the current year and the selected year, so the dropdown is never
  // empty and never loses a valid selection.
  const yearOptions = useMemo(() => {
    const years = new Set<number>();
    schedules.forEach((sched) => years.add(sched.tahun));
    orders.forEach((order) => years.add(order.year));
    years.add(new Date().getFullYear());
    years.add(selectedYear);
    return Array.from(years).sort((a, b) => a - b);
  }, [schedules, orders, selectedYear]);

  // Which month columns the matrix table renders: all 12 for "All", or just
  // the one selected month, so picking a month narrows the table instead of
  // just filtering rows.
  const monthsToShow = useMemo(
    () =>
      selectedMonths.length === 0
        ? Array.from({ length: 12 }, (_, i) => i)
        : [...selectedMonths].sort((a, b) => a - b),
    [selectedMonths],
  );

  const toggleMonth = (month: number) => {
    setSelectedMonths((prev) =>
      prev.includes(month) ? prev.filter((m) => m !== month) : [...prev, month],
    );
  };

  // machine list, grouped by sub (BLD / UTY / MTC), keyed by machine no
  const machinesBySub = useMemo(() => {
    const map = new Map<MachineSub, MachineRow[]>();
    for (const tab of subTabs) map.set(tab.key, []);

    for (const machine of machineRecords) {
      const sub = machine.kategori as MachineSub;
      if (!map.has(sub)) continue;
      map.get(sub)!.push({
        machineId: String(machine.no),
        assetNumber: machine.kode_mesin,
        machineName: machine.nama_mesin,
        location: machine.lokasi,
      });
    }

    for (const list of map.values()) {
      list.sort((a, b) => a.assetNumber.localeCompare(b.assetNumber));
    }

    return map;
  }, [machineRecords]);

  // machine_no -> sub, used so orders/schedules can be attributed to the
  // right tab even if a row's own `sub` field is missing/stale
  const subByMachineId = useMemo(() => {
    const map = new Map<string, MachineSub>();
    for (const machine of machineRecords) {
      map.set(String(machine.no), machine.kategori as MachineSub);
    }
    return map;
  }, [machineRecords]);

  // matrix: machineId -> "month-week" -> { types, status }
  // scheduled entries plot yellow; a Completed order upgrades that cell to green
  const matrix = useMemo(() => {
    const map = new Map<string, Map<string, MatrixCell>>();

    const upsert = (
      machineId: string,
      month: number,
      week: number,
      types: string[],
      status: CellStatus,
    ) => {
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
      upsert(
        String(sched.machine_no),
        sched.bulan,
        sched.minggu,
        splitTypes(sched.preventive_types),
        "scheduled",
      );
    }

    for (const order of orders) {
      if (order.year !== selectedYear) continue;
      if (order.status !== "Completed") continue;
      upsert(
        String(order.machine_no),
        order.month,
        order.week,
        splitTypes(order.preventive_types),
        "completed",
      );
    }

    return map;
  }, [schedules, orders, selectedYear]);

  const currentMachines = useMemo(() => {
    if (activeTab === "Dashboard") return [];
    const list = machinesBySub.get(activeTab) ?? [];
    if (!searchText.trim()) return list;
    const q = searchText.toLowerCase();
    return list.filter(
      (m) =>
        m.machineName.toLowerCase().includes(q) ||
        m.assetNumber.toLowerCase().includes(q) ||
        (m.location?.toLowerCase().includes(q) ?? false),
    );
  }, [machinesBySub, activeTab, searchText]);

  // Reset to page 1 whenever the filtered row set changes underneath the table
  useEffect(() => {
    setCurrentMatrixPage(1);
  }, [activeTab, selectedYear, selectedMonths, searchText]);

  const matrixPageCount = Math.max(1, Math.ceil(currentMachines.length / MATRIX_ROWS_PAGE_SIZE));

  useEffect(() => {
    setCurrentMatrixPage((page) => Math.min(page, matrixPageCount));
  }, [matrixPageCount]);

  const paginatedMatrixMachines = useMemo(
    () =>
      currentMachines.slice(
        (currentMatrixPage - 1) * MATRIX_ROWS_PAGE_SIZE,
        currentMatrixPage * MATRIX_ROWS_PAGE_SIZE,
      ),
    [currentMachines, currentMatrixPage],
  );

  // progress dashboard stats: per sub and per sub+month
  const dashboardStats = useMemo(() => {
    const perSub: Record<MachineSub, { scheduled: number; completed: number }> = {
      BLD: { scheduled: 0, completed: 0 },
      UTY: { scheduled: 0, completed: 0 },
      MTC: { scheduled: 0, completed: 0 },
    };

    const perSubMonth: Record<MachineSub, { scheduled: number; completed: number }[]> = {
      BLD: monthAbbrev.map(() => ({ scheduled: 0, completed: 0 })),
      UTY: monthAbbrev.map(() => ({ scheduled: 0, completed: 0 })),
      MTC: monthAbbrev.map(() => ({ scheduled: 0, completed: 0 })),
    };

    for (const sched of schedules) {
      if (sched.tahun !== selectedYear) continue;
      const sub = sched.sub ?? subByMachineId.get(String(sched.machine_no));
      if (!sub || !perSub[sub]) continue;
      perSub[sub].scheduled += 1;
      if (sched.bulan >= 0 && sched.bulan < 12) {
        perSubMonth[sub][sched.bulan].scheduled += 1;
      }
    }

    for (const order of orders) {
      if (order.year !== selectedYear || order.status !== "Completed") continue;
      const sub = order.sub ?? subByMachineId.get(String(order.machine_no));
      if (!sub || !perSub[sub]) continue;
      perSub[sub].completed += 1;
      if (order.month >= 0 && order.month < 12) {
        perSubMonth[sub][order.month].completed += 1;
      }
    }

    return { perSub, perSubMonth };
  }, [schedules, orders, subByMachineId, selectedYear]);

  const pct = (completed: number, scheduled: number) =>
    scheduled === 0 ? 0 : Math.min(100, Math.round((completed / scheduled) * 100));

  return (
    <>
      <PageMeta
        title="Yearly Schedule Matrix"
        description="Yearly preventive schedule matrix and completion dashboard by machine group"
      />
      <PageBreadcrumb pageTitle="Yearly Schedule Matrix" />

      <div className="space-y-6">
        <ComponentCard title="Matrix Controls">
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

            <label className="text-sm text-gray-700 dark:text-gray-300 md:col-span-2">
              <span className="mb-2 block">
                Months
                {selectedMonths.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedMonths([])}
                    className="ml-2 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
                  >
                    Clear (show Full Year)
                  </button>
                )}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {monthAbbrev.map((month, index) => {
                  const isSelected = selectedMonths.includes(index);
                  return (
                    <button
                      key={month}
                      type="button"
                      onClick={() => toggleMonth(index)}
                      aria-pressed={isSelected}
                      className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                        isSelected
                          ? "border-brand-500 bg-brand-500 text-white"
                          : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                      }`}
                    >
                      {month}
                    </button>
                  );
                })}
              </div>
            </label>

            {activeTab !== "Dashboard" && (
              <label className="text-sm text-gray-700 dark:text-gray-300 md:col-span-1">
                <span className="mb-2 block">Search machines</span>
                <input
                  type="text"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="Search by name, asset code, or location"
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </label>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-4 dark:border-white/[0.05]">
            {subTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                  activeTab === tab.key
                    ? "bg-brand-500 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
                }`}
              >
                {tab.label}
              </button>
            ))}
            {/* <button
              onClick={() => setActiveTab("Dashboard")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                activeTab === "Dashboard"
                  ? "bg-brand-500 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
              }`}
            >
              Progress Dashboard
            </button> */}
          </div>

          {activeTab !== "Dashboard" && (
            <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-gray-600 dark:text-gray-300">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-sm bg-yellow-300" /> Plotted / Scheduled
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-sm bg-green-400" /> Completed
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-sm border border-gray-300" /> Not scheduled
              </span>
              {isLoading && <span className="italic text-gray-400">Loading...</span>}
            </div>
          )}
        </ComponentCard>

        {activeTab !== "Dashboard" ? (
          <ComponentCard
            title={`${activeTab} - Matrix (${
              selectedMonths.length === 0
                ? "Full Year"
                : monthsToShow.map((m) => monthAbbrev[m]).join(", ")
            } ${selectedYear})`}
          >
            <div className="mb-3 text-sm text-gray-600 dark:text-gray-300">
              {dashboardStats.perSub[activeTab].completed} of{" "}
              {dashboardStats.perSub[activeTab].scheduled} scheduled entries completed (
              {pct(dashboardStats.perSub[activeTab].completed, dashboardStats.perSub[activeTab].scheduled)}
              %)
            </div>

            <div className="overflow-auto rounded-xl border border-gray-200 dark:border-white/[0.05]" style={{ maxHeight: "70vh" }}>
              <table className="border-collapse text-[10px]">
                <thead>
                  <tr>
                    <th
                      className="sticky top-0 left-0 z-30 border border-gray-200 bg-gray-50 px-2 py-2 text-left text-gray-700 dark:border-white/[0.05] dark:bg-gray-800 dark:text-gray-200"
                      style={{ minWidth: 90, position: "sticky", left: 0 }}
                      rowSpan={2}
                    >
                      Asset Code
                    </th>
                    <th
                      className="sticky top-0 z-30 border border-gray-200 bg-gray-50 px-2 py-2 text-left text-gray-700 dark:border-white/[0.05] dark:bg-gray-800 dark:text-gray-200"
                      style={{ minWidth: 200, position: "sticky", left: 90 }}
                      rowSpan={2}
                    >
                      Machine Name
                    </th>
                    <th
                      className="sticky top-0 z-30 border border-gray-200 bg-gray-50 px-2 py-2 text-left text-gray-700 dark:border-white/[0.05] dark:bg-gray-800 dark:text-gray-200"
                      style={{ minWidth: 160, position: "sticky", left: 290 }}
                      rowSpan={2}
                    >
                      Location
                    </th>
                    {monthsToShow.map((month) => (
                      <th
                        key={month}
                        colSpan={WEEKS_PER_MONTH}
                        className="sticky top-0 z-20 border border-gray-200 bg-gray-50 px-1 py-1 text-center text-gray-700 dark:border-white/[0.05] dark:bg-gray-800 dark:text-gray-200"
                      >
                        {monthAbbrev[month]}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {monthsToShow.flatMap((month) =>
                      Array.from({ length: WEEKS_PER_MONTH }, (_, i) => (
                        <th
                          key={`${month}-w${i + 1}`}
                          className="sticky z-20 border border-gray-200 bg-gray-50 px-1 py-1 text-center text-gray-700 dark:border-white/[0.05] dark:bg-gray-800 dark:text-gray-200"
                          style={{ top: 28, minWidth: 26 }}
                        >
                          W{i + 1}
                        </th>
                      )),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {paginatedMatrixMachines.map((machine) => (
                    <tr key={machine.machineId}>
                      <td
                        className="border border-gray-200 bg-white px-2 py-1 font-medium text-gray-700 dark:border-white/[0.05] dark:bg-gray-900 dark:text-gray-200"
                        style={{ position: "sticky", left: 0, zIndex: 10 }}
                      >
                        {machine.assetNumber}
                      </td>
                      <td
                        className="border border-gray-200 bg-white px-2 py-1 text-gray-700 dark:border-white/[0.05] dark:bg-gray-900 dark:text-gray-200"
                        style={{ position: "sticky", left: 90, zIndex: 10 }}
                      >
                        {machine.machineName}
                      </td>
                      <td
                        className="border border-gray-200 bg-white px-2 py-1 text-gray-700 dark:border-white/[0.05] dark:bg-gray-900 dark:text-gray-200"
                        style={{ position: "sticky", left: 290, zIndex: 10 }}
                      >
                        {machine.location}
                      </td>
                      {monthsToShow.map((month) =>
                        Array.from({ length: WEEKS_PER_MONTH }, (_, i) => {
                          const week = i + 1;
                          const cell = matrix.get(machine.machineId)?.get(cellKey(month, week));
                          const bg =
                            cell?.status === "completed"
                              ? "bg-green-300 dark:bg-green-700/70"
                              : cell?.status === "scheduled"
                                ? "bg-yellow-200 dark:bg-yellow-600/60"
                                : "";
                          return (
                            <td
                              key={`${machine.machineId}-${month}-${week}`}
                              className={`whitespace-pre-line border border-gray-200 px-1 py-1 text-center text-gray-800 dark:border-white/[0.05] dark:text-gray-100 ${bg}`}
                              title={cell?.types.join(" + ")}
                            >
                              {cell?.types.join("\n") ?? ""}
                            </td>
                          );
                        }),
                      )}
                    </tr>
                  ))}
                  {!isLoading && currentMachines.length === 0 && (
                    <tr>
                      <td colSpan={3 + monthsToShow.length * WEEKS_PER_MONTH} className="px-4 py-6 text-center text-gray-400">
                        No machines found for {activeTab}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {!isLoading && currentMachines.length > 0 && (
              <div className="mt-3 flex flex-col items-center justify-between gap-2 sm:flex-row">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Showing {(currentMatrixPage - 1) * MATRIX_ROWS_PAGE_SIZE + 1}-
                  {Math.min(currentMatrixPage * MATRIX_ROWS_PAGE_SIZE, currentMachines.length)} of{" "}
                  {currentMachines.length} machines
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentMatrixPage((p) => Math.max(1, p - 1))}
                    disabled={currentMatrixPage <= 1}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-200"
                  >
                    Previous
                  </button>
                  <span className="text-xs text-gray-600 dark:text-gray-300">
                    Page {currentMatrixPage} of {matrixPageCount}
                  </span>
                  <button
                    onClick={() => setCurrentMatrixPage((p) => Math.min(matrixPageCount, p + 1))}
                    disabled={currentMatrixPage >= matrixPageCount}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-200"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </ComponentCard>
        ) : (
          <YearlyProgressDashboard
            year={selectedYear}
            showYearSelector={false}
            machines={machineRecords}
            schedules={schedules}
            orders={orders}
            isLoading={isLoading}
          />
        )}
      </div>
    </>
  );
}
