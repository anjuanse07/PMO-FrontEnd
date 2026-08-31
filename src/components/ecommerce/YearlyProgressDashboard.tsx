import { useEffect, useMemo, useState } from "react";
import ComponentCard from "../common/ComponentCard";
import Badge from "../ui/badge/Badge";
import { type MachineSub } from "../../data/preventiveMaintenanceData";
import {
  fetchMachines,
  fetchSchedules,
  fetchApprovedOrders,
  type MachineRecord,
  type ScheduleRecord,
  type ApprovedOrderRecord,
} from "../../services/pmoApi";

/**
 * Yearly preventive-maintenance progress dashboard: overall completion,
 * per-group (BLD/UTY/MTC) completion, and a monthly completion breakdown.
 *
 * Works in two modes:
 *  - Standalone (default): fetches machines/schedules/approved orders itself
 *    and shows its own Year selector. Drop it anywhere (e.g. Home.tsx) with
 *    no props.
 *  - Controlled: pass `machines` / `schedules` / `orders` (and `year`,
 *    `showYearSelector={false}`) when the parent page already has this data
 *    loaded (e.g. YearlyScheduleMatrix.tsx), to avoid a duplicate fetch.
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

const subTabs: { key: MachineSub; label: string }[] = [
  { key: "BLD", label: "BLD" },
  { key: "UTY", label: "UTY" },
  { key: "MTC", label: "MTC" },
];

interface YearlyProgressDashboardProps {
  /** Year to show. In standalone mode this also seeds the internal selector. */
  year?: number;
  /** Show the built-in Year dropdown. Set false when the parent page already has one. */
  showYearSelector?: boolean;
  /** Pass these three together to run in controlled mode (no internal fetch). */
  machines?: MachineRecord[];
  schedules?: ScheduleRecord[];
  orders?: ApprovedOrderRecord[];
  isLoading?: boolean;
  title?: string;
}

export default function YearlyProgressDashboard({
  year,
  showYearSelector = true,
  machines: machinesProp,
  schedules: schedulesProp,
  orders: ordersProp,
  isLoading: isLoadingProp,
  title = "Preventive Maintenance Progress",
}: YearlyProgressDashboardProps) {
  const isControlled = machinesProp !== undefined && schedulesProp !== undefined && ordersProp !== undefined;

  const [selectedYear, setSelectedYear] = useState(year ?? new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number | "All">("All");
  const [machineRecords, setMachineRecords] = useState<MachineRecord[]>([]);
  const [schedules, setSchedules] = useState<ScheduleRecord[]>([]);
  const [orders, setOrders] = useState<ApprovedOrderRecord[]>([]);
  const [isLoading, setIsLoading] = useState(!isControlled);

  useEffect(() => {
    if (year !== undefined) setSelectedYear(year);
  }, [year]);

  useEffect(() => {
    if (isControlled) return;

    const loadAll = async () => {
      try {
        setIsLoading(true);
        const [machinesData, scheduleRows, orderRows] = await Promise.all([
          fetchMachines(),
          fetchSchedules(),
          fetchApprovedOrders(),
        ]);
        setMachineRecords(machinesData);
        setSchedules(scheduleRows);
        setOrders(orderRows);
      } catch (error) {
        console.error("Failed to load yearly progress dashboard data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    void loadAll();
  }, [isControlled]);

  const effectiveMachines = isControlled ? machinesProp! : machineRecords;
  const effectiveSchedules = isControlled ? schedulesProp! : schedules;
  const effectiveOrders = isControlled ? ordersProp! : orders;
  const effectiveLoading = isControlled ? Boolean(isLoadingProp) : isLoading;

  // Year filter reflects whatever years actually have schedule or order data,
  // plus the current year and the selected year, so the dropdown is never
  // empty and never loses a valid selection.
  const yearOptions = useMemo(() => {
    const years = new Set<number>();
    effectiveSchedules.forEach((sched) => years.add(sched.tahun));
    effectiveOrders.forEach((order) => years.add(order.year));
    years.add(new Date().getFullYear());
    years.add(selectedYear);
    return Array.from(years).sort((a, b) => a - b);
  }, [effectiveSchedules, effectiveOrders, selectedYear]);

  // machine_no -> sub, used so orders/schedules can be attributed to the
  // right group even if a row's own `sub` field is missing/stale
  const subByMachineId = useMemo(() => {
    const map = new Map<string, MachineSub>();
    for (const machine of effectiveMachines) {
      map.set(String(machine.no), machine.kategori as MachineSub);
    }
    return map;
  }, [effectiveMachines]);

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

    for (const sched of effectiveSchedules) {
      if (sched.tahun !== selectedYear) continue;
      const sub = sched.sub ?? subByMachineId.get(String(sched.machine_no));
      if (!sub || !perSub[sub]) continue;
      perSub[sub].scheduled += 1;
      if (sched.bulan >= 0 && sched.bulan < 12) {
        perSubMonth[sub][sched.bulan].scheduled += 1;
      }
    }

    for (const order of effectiveOrders) {
      if (order.year !== selectedYear || order.status !== "Completed") continue;
      const sub = order.sub ?? subByMachineId.get(String(order.machine_no));
      if (!sub || !perSub[sub]) continue;
      perSub[sub].completed += 1;
      if (order.month >= 0 && order.month < 12) {
        perSubMonth[sub][order.month].completed += 1;
      }
    }

    return { perSub, perSubMonth };
  }, [effectiveSchedules, effectiveOrders, subByMachineId, selectedYear]);

  const overallStats = useMemo(() => {
    return Object.values(dashboardStats.perSub).reduce(
      (acc, cur) => ({
        scheduled: acc.scheduled + cur.scheduled,
        completed: acc.completed + cur.completed,
      }),
      { scheduled: 0, completed: 0 },
    );
  }, [dashboardStats]);

  // Per-month totals across BLD + UTY + MTC, for the breakdown table's "Total" row
  const totalsByMonth = useMemo(
    () =>
      monthAbbrev.map((_, idx) =>
        subTabs.reduce(
          (acc, tab) => {
            const cell = dashboardStats.perSubMonth[tab.key][idx];
            return {
              scheduled: acc.scheduled + cell.scheduled,
              completed: acc.completed + cell.completed,
            };
          },
          { scheduled: 0, completed: 0 },
        ),
      ),
    [dashboardStats],
  );

  const pct = (completed: number, scheduled: number) =>
    scheduled === 0 ? 0 : Math.min(100, Math.round((completed / scheduled) * 100));

  return (
    <div className="space-y-6">
      {showYearSelector && (
        <ComponentCard title={title}>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="text-sm text-gray-700 dark:text-gray-300">
              <span className="mb-2 block">Year</span>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              >
                {yearOptions.map((yr) => (
                  <option key={yr} value={yr}>
                    {yr}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm text-gray-700 dark:text-gray-300">
              <span className="mb-2 block">Month (BLD / UTY / MTC groups)</span>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value === "All" ? "All" : Number(e.target.value))}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              >
                <option value="All">Full Year</option>
                {monthAbbrev.map((month, idx) => (
                  <option key={month} value={idx}>
                    {month}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {effectiveLoading && (
            <div className="mt-3 text-xs italic text-gray-400 dark:text-gray-500">Loading...</div>
          )}
        </ComponentCard>
      )}

      <ComponentCard title={`Overall Progress - ${selectedYear}`}>
        <div className="mb-2 flex items-center justify-between text-sm text-gray-700 dark:text-gray-300">
          <span>
            {overallStats.completed} of {overallStats.scheduled} preventive actions completed
          </span>
          <Badge size="sm" color={pct(overallStats.completed, overallStats.scheduled) >= 80 ? "success" : "warning"}>
            {pct(overallStats.completed, overallStats.scheduled)}%
          </Badge>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
          <div
            className="h-full rounded-full bg-brand-500"
            style={{ width: `${pct(overallStats.completed, overallStats.scheduled)}%` }}
          />
        </div>
      </ComponentCard>

      <div className="grid gap-4 md:grid-cols-3">
        {subTabs.map((tab) => {
          const stat =
            selectedMonth === "All" ? dashboardStats.perSub[tab.key] : dashboardStats.perSubMonth[tab.key][selectedMonth];
          const percent = pct(stat.completed, stat.scheduled);
          return (
            <ComponentCard key={tab.key} title={`${tab.label} Group`}>
              <p className="mb-2 text-xs text-gray-400 dark:text-gray-500">
                {selectedMonth === "All" ? `Full year ${selectedYear}` : `${monthAbbrev[selectedMonth]} ${selectedYear}`}
              </p>
              <div className="mb-2 flex items-center justify-between text-sm text-gray-700 dark:text-gray-300">
                <span>
                  {stat.completed} / {stat.scheduled} completed
                </span>
                <Badge size="sm" color={percent >= 80 ? "success" : percent >= 50 ? "primary" : "warning"}>
                  {percent}%
                </Badge>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                <div
                  className={`h-full rounded-full ${
                    percent >= 80 ? "bg-green-500" : percent >= 50 ? "bg-brand-500" : "bg-yellow-400"
                  }`}
                  style={{ width: `${percent}%` }}
                />
              </div>
            </ComponentCard>
          );
        })}
      </div>

      <ComponentCard title="Monthly Completion Breakdown">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-gray-50 dark:bg-gray-800/60">
              <tr>
                <th className="px-3 py-2 font-semibold uppercase text-gray-600 dark:text-gray-300">Group</th>
                {monthAbbrev.map((month) => (
                  <th key={month} className="px-3 py-2 text-center font-semibold uppercase text-gray-600 dark:text-gray-300">
                    {month}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
              {subTabs.map((tab) => (
                <tr key={tab.key}>
                  <td className="px-3 py-2 font-medium text-gray-700 dark:text-gray-300">{tab.label}</td>
                  {dashboardStats.perSubMonth[tab.key].map((cell, idx) => {
                    const percent = pct(cell.completed, cell.scheduled);
                    return (
                      <td key={idx} className="px-3 py-2 text-center text-gray-600 dark:text-gray-300">
                        {cell.scheduled === 0 ? (
                          <span className="text-gray-300 dark:text-gray-600">-</span>
                        ) : (
                          <span
                            className={
                              percent >= 80
                                ? "text-green-600 dark:text-green-400"
                                : percent >= 50
                                  ? "text-brand-600 dark:text-brand-400"
                                  : "text-yellow-600 dark:text-yellow-400"
                            }
                          >
                            {cell.completed}/{cell.scheduled}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="border-t border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/40">
                <td className="px-3 py-2 font-semibold text-gray-800 dark:text-white">Total</td>
                {totalsByMonth.map((cell, idx) => {
                  const percent = pct(cell.completed, cell.scheduled);
                  return (
                    <td key={idx} className="px-3 py-2 text-center font-semibold text-gray-800 dark:text-white">
                      {cell.scheduled === 0 ? (
                        <span className="text-gray-300 dark:text-gray-600">-</span>
                      ) : (
                        <span
                          className={
                            percent >= 80
                              ? "text-green-700 dark:text-green-300"
                              : percent >= 50
                                ? "text-brand-700 dark:text-brand-300"
                                : "text-yellow-700 dark:text-yellow-300"
                          }
                        >
                          {cell.completed}/{cell.scheduled}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </ComponentCard>
    </div>
  );
}
