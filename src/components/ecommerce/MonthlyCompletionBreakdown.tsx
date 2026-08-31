import { useEffect, useMemo, useState } from "react";
import ComponentCard from "../common/ComponentCard";
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
 * Standalone "Monthly Completion Breakdown" table (BLD/UTY/MTC x Jan..Dec),
 * extracted out of YearlyProgressDashboard.tsx so it can be placed
 * side-by-side with YearlyScheduleMatrixPreview on the dashboard instead of
 * living inside the full-width progress block.
 *
 * Same two modes as the other dashboard preview cards:
 *  - Standalone (default): fetches its own data, defaults to the current year.
 *  - Controlled: pass `machines` / `schedules` / `orders` (+ optional `year`,
 *    `isLoading`) when the parent page already has this data loaded, to
 *    avoid a duplicate fetch.
 */

const monthAbbrev = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const subTabs: { key: MachineSub; label: string }[] = [
  { key: "BLD", label: "BLD" },
  { key: "UTY", label: "UTY" },
  { key: "MTC", label: "MTC" },
];

interface MonthlyCompletionBreakdownProps {
  machines?: MachineRecord[];
  schedules?: ScheduleRecord[];
  orders?: ApprovedOrderRecord[];
  isLoading?: boolean;
  year?: number;
  /** Show the built-in Year dropdown. Set false when a parent page has a shared one. */
  showYearSelector?: boolean;
}

export default function MonthlyCompletionBreakdown({
  machines: machinesProp,
  schedules: schedulesProp,
  orders: ordersProp,
  isLoading: isLoadingProp,
  year,
  showYearSelector = true,
}: MonthlyCompletionBreakdownProps) {
  const isControlled = machinesProp !== undefined && schedulesProp !== undefined && ordersProp !== undefined;

  const [selectedYear, setSelectedYear] = useState(year ?? new Date().getFullYear());
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
        console.error("Failed to load monthly completion breakdown data:", error);
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

  const yearOptions = useMemo(() => {
    const years = new Set<number>();
    effectiveSchedules.forEach((sched) => years.add(sched.tahun));
    effectiveOrders.forEach((order) => years.add(order.year));
    years.add(new Date().getFullYear());
    years.add(selectedYear);
    return Array.from(years).sort((a, b) => a - b);
  }, [effectiveSchedules, effectiveOrders, selectedYear]);

  const subByMachineId = useMemo(() => {
    const map = new Map<string, MachineSub>();
    for (const machine of effectiveMachines) {
      map.set(String(machine.no), machine.kategori as MachineSub);
    }
    return map;
  }, [effectiveMachines]);

  const perSubMonth = useMemo(() => {
    const stats: Record<MachineSub, { scheduled: number; completed: number }[]> = {
      BLD: monthAbbrev.map(() => ({ scheduled: 0, completed: 0 })),
      UTY: monthAbbrev.map(() => ({ scheduled: 0, completed: 0 })),
      MTC: monthAbbrev.map(() => ({ scheduled: 0, completed: 0 })),
    };

    for (const sched of effectiveSchedules) {
      if (sched.tahun !== selectedYear) continue;
      const sub = sched.sub ?? subByMachineId.get(String(sched.machine_no));
      if (!sub || !stats[sub]) continue;
      if (sched.bulan >= 0 && sched.bulan < 12) stats[sub][sched.bulan].scheduled += 1;
    }

    for (const order of effectiveOrders) {
      if (order.year !== selectedYear || order.status !== "Completed") continue;
      const sub = order.sub ?? subByMachineId.get(String(order.machine_no));
      if (!sub || !stats[sub]) continue;
      if (order.month >= 0 && order.month < 12) stats[sub][order.month].completed += 1;
    }

    return stats;
  }, [effectiveSchedules, effectiveOrders, subByMachineId, selectedYear]);

  const totalsByMonth = useMemo(
    () =>
      monthAbbrev.map((_, idx) =>
        subTabs.reduce(
          (acc, tab) => {
            const cell = perSubMonth[tab.key][idx];
            return {
              scheduled: acc.scheduled + cell.scheduled,
              completed: acc.completed + cell.completed,
            };
          },
          { scheduled: 0, completed: 0 },
        ),
      ),
    [perSubMonth],
  );

  const pct = (completed: number, scheduled: number) =>
    scheduled === 0 ? 0 : Math.min(100, Math.round((completed / scheduled) * 100));

  return (
    <ComponentCard title="Monthly Completion Breakdown">
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-sm text-gray-500 dark:text-gray-400">
          Completed vs scheduled, per group, per month
        </span>
        {!isControlled && showYearSelector && (
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          >
            {yearOptions.map((yr) => (
              <option key={yr} value={yr}>
                {yr}
              </option>
            ))}
          </select>
        )}
      </div>

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
                {perSubMonth[tab.key].map((cell, idx) => {
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
      {effectiveLoading && (
        <div className="mt-3 text-xs italic text-gray-400 dark:text-gray-500">Loading...</div>
      )}
    </ComponentCard>
  );
}
