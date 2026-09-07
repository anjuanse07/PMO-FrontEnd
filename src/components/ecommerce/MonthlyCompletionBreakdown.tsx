import { useEffect, useMemo, useState, Fragment } from "react";
import ComponentCard from "../common/ComponentCard";
import { type MachineSub } from "../../data/preventiveMaintenanceData";
import { useSchedules, useApprovedOrders } from "../../hooks/useScheduleData";
import { fetchMachines, type MachineRecord, type ScheduleRecord, type ApprovedOrderRecord } from "../../services/pmoApi";

/**
 * Standalone "Monthly Completion Breakdown" table (BLD/UTY/MTC x Jan..Dec),
 * extracted out of YearlyProgressDashboard.tsx so it can be placed
 * side-by-side with YearlyScheduleMatrixPreview on the dashboard instead of
 * living inside the full-width progress block.
 *
 * Each main-sub row (MTC/UTY) can expand to show its child-sub breakdown
 * (e.g. MTC 1 / MTC 2, from machines.sub_child) - BLD has no split, so it
 * never gets an expand toggle.
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

type MonthStat = { scheduled: number; completed: number };

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
  const [isLoadingMachines, setIsLoadingMachines] = useState(!isControlled);
  // Unscoped ("All" years) - yearOptions below needs to see every year that
  // has ever had schedule/order data, not just the currently selected one.
  const { schedules: fetchedSchedules, isLoadingSchedules } = useSchedules("All");
  const { orders: fetchedOrders, isLoadingOrders } = useApprovedOrders("All");
  const [expandedSubs, setExpandedSubs] = useState<Set<MachineSub>>(new Set());

  useEffect(() => {
    if (year !== undefined) setSelectedYear(year);
  }, [year]);

  useEffect(() => {
    if (isControlled) return;
    const loadMachines = async () => {
      try {
        setIsLoadingMachines(true);
        const machinesData = await fetchMachines();
        setMachineRecords(machinesData);
      } catch (error) {
        console.error("Failed to load monthly completion breakdown data:", error);
      } finally {
        setIsLoadingMachines(false);
      }
    };
    void loadMachines();
  }, [isControlled]);

  const effectiveMachines = isControlled ? machinesProp! : machineRecords;
  const effectiveSchedules = isControlled ? schedulesProp! : fetchedSchedules;
  const effectiveOrders = isControlled ? ordersProp! : fetchedOrders;
  const effectiveLoading = isControlled
    ? Boolean(isLoadingProp)
    : isLoadingMachines || isLoadingSchedules || isLoadingOrders;

  const yearOptions = useMemo(() => {
    const years = new Set<number>();
    effectiveSchedules.forEach((sched) => years.add(sched.tahun));
    effectiveOrders.forEach((order) => years.add(order.year));
    years.add(new Date().getFullYear());
    years.add(selectedYear);
    return Array.from(years).sort((a, b) => a - b);
  }, [effectiveSchedules, effectiveOrders, selectedYear]);

  // machine_no -> main sub, and machine_no -> child sub (falls back to the
  // main sub label itself when sub_child hasn't been backfilled yet, so
  // every machine still counts somewhere sensible).
  const subByMachineId = useMemo(() => {
    const map = new Map<string, MachineSub>();
    for (const machine of effectiveMachines) {
      map.set(String(machine.no), machine.kategori as MachineSub);
    }
    return map;
  }, [effectiveMachines]);

  const childSubByMachineId = useMemo(() => {
    const map = new Map<string, string>();
    for (const machine of effectiveMachines) {
      map.set(String(machine.no), machine.sub_child || machine.kategori);
    }
    return map;
  }, [effectiveMachines]);

  // Which child subs actually exist under each main sub, so BLD (which has
  // no real split) never gets an expand toggle, and MTC/UTY only list the
  // child subs that are genuinely in use.
  const childSubsByMainSub = useMemo(() => {
    const map: Record<MachineSub, string[]> = { BLD: [], UTY: [], MTC: [] };
    const seen: Record<MachineSub, Set<string>> = { BLD: new Set(), UTY: new Set(), MTC: new Set() };
    for (const machine of effectiveMachines) {
      const main = machine.kategori as MachineSub;
      if (!seen[main]) continue;
      seen[main].add(machine.sub_child || machine.kategori);
    }
    for (const key of Object.keys(seen) as MachineSub[]) {
      map[key] = Array.from(seen[key]).sort();
    }
    return map;
  }, [effectiveMachines]);

  const perSubMonth = useMemo(() => {
    const stats: Record<MachineSub, MonthStat[]> = {
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

  // Same as perSubMonth, but keyed by child sub label (e.g. "MTC 1") instead
  // of main sub, for the expandable rows.
  const perChildSubMonth = useMemo(() => {
    const stats: Record<string, MonthStat[]> = {};
    const ensure = (key: string) => {
      if (!stats[key]) stats[key] = monthAbbrev.map(() => ({ scheduled: 0, completed: 0 }));
      return stats[key];
    };

    for (const sched of effectiveSchedules) {
      if (sched.tahun !== selectedYear) continue;
      const childSub = childSubByMachineId.get(String(sched.machine_no));
      if (!childSub) continue;
      if (sched.bulan >= 0 && sched.bulan < 12) ensure(childSub)[sched.bulan].scheduled += 1;
    }

    for (const order of effectiveOrders) {
      if (order.year !== selectedYear || order.status !== "Completed") continue;
      const childSub = childSubByMachineId.get(String(order.machine_no));
      if (!childSub) continue;
      if (order.month >= 0 && order.month < 12) ensure(childSub)[order.month].completed += 1;
    }

    return stats;
  }, [effectiveSchedules, effectiveOrders, childSubByMachineId, selectedYear]);

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

  const toggleExpanded = (sub: MachineSub) => {
    setExpandedSubs((prev) => {
      const next = new Set(prev);
      if (next.has(sub)) next.delete(sub);
      else next.add(sub);
      return next;
    });
  };

  const cellContent = (cell: MonthStat, weight: "normal" | "bold") => {
    const percent = pct(cell.completed, cell.scheduled);
    if (cell.scheduled === 0) return <span className="text-gray-300 dark:text-gray-600">-</span>;
    const colorClass =
      percent >= 80
        ? weight === "bold" ? "text-green-700 dark:text-green-300" : "text-green-600 dark:text-green-400"
        : percent >= 50
          ? weight === "bold" ? "text-brand-700 dark:text-brand-300" : "text-brand-600 dark:text-brand-400"
          : weight === "bold" ? "text-yellow-700 dark:text-yellow-300" : "text-yellow-600 dark:text-yellow-400";
    return (
      <span className={colorClass}>
        {cell.completed}/{cell.scheduled}
      </span>
    );
  };

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
            {subTabs.map((tab) => {
              const childSubs = childSubsByMainSub[tab.key] ?? [];
              const canExpand = childSubs.length > 1;
              const isExpanded = expandedSubs.has(tab.key);
              return (
                <Fragment key={tab.key}>
                  <tr>
                    <td className="px-3 py-2 font-medium text-gray-700 dark:text-gray-300">
                      {canExpand ? (
                        <button
                          type="button"
                          onClick={() => toggleExpanded(tab.key)}
                          className="flex items-center gap-1.5 hover:text-brand-600 dark:hover:text-brand-400"
                        >
                          <span className={`text-[10px] transition-transform ${isExpanded ? "rotate-90" : ""}`}>▸</span>
                          {tab.label}
                        </button>
                      ) : (
                        tab.label
                      )}
                    </td>
                    {perSubMonth[tab.key].map((cell, idx) => (
                      <td key={idx} className="px-3 py-2 text-center text-gray-600 dark:text-gray-300">
                        {cellContent(cell, "normal")}
                      </td>
                    ))}
                  </tr>
                  {canExpand &&
                    isExpanded &&
                    childSubs.map((childSub) => {
                      const row = perChildSubMonth[childSub] ?? monthAbbrev.map(() => ({ scheduled: 0, completed: 0 }));
                      return (
                        <tr key={childSub} className="bg-gray-50/60 dark:bg-white/[0.015]">
                          <td className="px-3 py-1.5 pl-8 text-[11px] text-gray-500 dark:text-gray-400">{childSub}</td>
                          {row.map((cell, idx) => (
                            <td key={idx} className="px-3 py-1.5 text-center text-[11px] text-gray-500 dark:text-gray-400">
                              {cellContent(cell, "normal")}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                </Fragment>
              );
            })}
            <tr className="border-t border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/40">
              <td className="px-3 py-2 font-semibold text-gray-800 dark:text-white">Total</td>
              {totalsByMonth.map((cell, idx) => (
                <td key={idx} className="px-3 py-2 text-center font-semibold text-gray-800 dark:text-white">
                  {cellContent(cell, "bold")}
                </td>
              ))}
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
