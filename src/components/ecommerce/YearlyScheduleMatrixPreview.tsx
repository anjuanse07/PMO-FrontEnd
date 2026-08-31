import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
 * Compact dashboard preview of the full YearlyScheduleMatrix.tsx page.
 * Instead of the full per-machine week-by-week grid (too dense for a
 * dashboard tile), this shows, per machine group (BLD/UTY/MTC):
 *   - a week-by-week heat strip for the selected month (yellow = scheduled,
 *     green = completed, empty = nothing plotted that week)
 *   - the group's full-year completion badge
 * "View Full Matrix" links out to the real YearlyScheduleMatrix.tsx page
 * for the detailed per-machine breakdown.
 *
 * NOTE: update the `to="/yearly-schedule-matrix"` path below once that page
 * is registered in the router if the route differs.
 */

const monthAbbrev = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const WEEKS_PER_MONTH = 5;

const subTabs: { key: MachineSub; label: string }[] = [
  { key: "BLD", label: "BLD" },
  { key: "UTY", label: "UTY" },
  { key: "MTC", label: "MTC" },
];

type WeekStatus = "empty" | "scheduled" | "completed";

interface YearlyScheduleMatrixPreviewProps {
  machines?: MachineRecord[];
  schedules?: ScheduleRecord[];
  orders?: ApprovedOrderRecord[];
  isLoading?: boolean;
  year?: number;
}

export default function YearlyScheduleMatrixPreview({
  machines: machinesProp,
  schedules: schedulesProp,
  orders: ordersProp,
  isLoading: isLoadingProp,
  year,
}: YearlyScheduleMatrixPreviewProps) {
  const isControlled = machinesProp !== undefined && schedulesProp !== undefined && ordersProp !== undefined;

  const [selectedYear, setSelectedYear] = useState(year ?? new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
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
        console.error("Failed to load yearly schedule matrix preview data:", error);
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

  const subByMachineId = useMemo(() => {
    const map = new Map<string, MachineSub>();
    for (const machine of effectiveMachines) {
      map.set(String(machine.no), machine.kategori as MachineSub);
    }
    return map;
  }, [effectiveMachines]);

  // Week-level status per sub group, for the selected month only - lighter
  // than the full per-machine matrix, but still shows exactly which weeks
  // still need attention this month.
  const weekStripBySub = useMemo(() => {
    const strip: Record<MachineSub, WeekStatus[]> = {
      BLD: Array(WEEKS_PER_MONTH).fill("empty"),
      UTY: Array(WEEKS_PER_MONTH).fill("empty"),
      MTC: Array(WEEKS_PER_MONTH).fill("empty"),
    };

    for (const sched of effectiveSchedules) {
      if (sched.tahun !== selectedYear || sched.bulan !== selectedMonth) continue;
      const sub = sched.sub ?? subByMachineId.get(String(sched.machine_no));
      const weekIdx = sched.minggu - 1;
      if (!sub || !strip[sub] || weekIdx < 0 || weekIdx >= WEEKS_PER_MONTH) continue;
      if (strip[sub][weekIdx] === "empty") strip[sub][weekIdx] = "scheduled";
    }

    for (const order of effectiveOrders) {
      if (order.year !== selectedYear || order.month !== selectedMonth || order.status !== "Completed") continue;
      const sub = order.sub ?? subByMachineId.get(String(order.machine_no));
      const weekIdx = order.week - 1;
      if (!sub || !strip[sub] || weekIdx < 0 || weekIdx >= WEEKS_PER_MONTH) continue;
      strip[sub][weekIdx] = "completed";
    }

    return strip;
  }, [effectiveSchedules, effectiveOrders, subByMachineId, selectedYear, selectedMonth]);

  // Full-year completion per sub group, for the badge next to each strip
  const yearCompletionBySub = useMemo(() => {
    const stats: Record<MachineSub, { scheduled: number; completed: number }> = {
      BLD: { scheduled: 0, completed: 0 },
      UTY: { scheduled: 0, completed: 0 },
      MTC: { scheduled: 0, completed: 0 },
    };

    for (const sched of effectiveSchedules) {
      if (sched.tahun !== selectedYear) continue;
      const sub = sched.sub ?? subByMachineId.get(String(sched.machine_no));
      if (!sub || !stats[sub]) continue;
      stats[sub].scheduled += 1;
    }

    for (const order of effectiveOrders) {
      if (order.year !== selectedYear || order.status !== "Completed") continue;
      const sub = order.sub ?? subByMachineId.get(String(order.machine_no));
      if (!sub || !stats[sub]) continue;
      stats[sub].completed += 1;
    }

    return stats;
  }, [effectiveSchedules, effectiveOrders, subByMachineId, selectedYear]);

  const pct = (completed: number, scheduled: number) =>
    scheduled === 0 ? 0 : Math.min(100, Math.round((completed / scheduled) * 100));

  return (
    <ComponentCard title="Yearly Schedule Matrix">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <span>Month</span>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          >
            {monthAbbrev.map((month, idx) => (
              <option key={month} value={idx}>
                {month}
              </option>
            ))}
          </select>
        </label>
        <Link
          to="/yearly-schedule-matrix"
          className="text-sm font-medium text-brand-500 hover:text-brand-600 dark:text-brand-400"
        >
          View Full Matrix &rarr;
        </Link>
      </div>

      <div className="space-y-3">
        {subTabs.map((tab) => {
          const stat = yearCompletionBySub[tab.key];
          const percent = pct(stat.completed, stat.scheduled);
          return (
            <div
              key={tab.key}
              className="flex flex-col gap-2 rounded-xl border border-gray-100 p-3 dark:border-white/[0.05] sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-3">
                <span className="w-10 shrink-0 text-sm font-semibold text-gray-700 dark:text-gray-200">
                  {tab.label}
                </span>
                <div className="flex gap-1">
                  {weekStripBySub[tab.key].map((status, idx) => (
                    <div
                      key={idx}
                      title={`Week ${idx + 1}: ${status}`}
                      className={`flex h-6 w-6 items-center justify-center rounded text-[10px] font-medium ${
                        status === "completed"
                          ? "bg-green-400 text-green-900 dark:bg-green-700/70 dark:text-green-100"
                          : status === "scheduled"
                            ? "bg-yellow-200 text-yellow-800 dark:bg-yellow-600/60 dark:text-yellow-100"
                            : "border border-dashed border-gray-300 text-gray-300 dark:border-gray-700 dark:text-gray-600"
                      }`}
                    >
                      W{idx + 1}
                    </div>
                  ))}
                </div>
              </div>
              <Badge size="sm" color={percent >= 80 ? "success" : percent >= 50 ? "primary" : "warning"}>
                {stat.completed}/{stat.scheduled} this year ({percent}%)
              </Badge>
            </div>
          );
        })}
        {effectiveLoading && (
          <div className="text-xs italic text-gray-400 dark:text-gray-500">Loading...</div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-gray-600 dark:text-gray-300">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-yellow-200" /> Plotted / Scheduled
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-green-400" /> Completed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm border border-dashed border-gray-300" /> Not scheduled
        </span>
      </div>
    </ComponentCard>
  );
}
