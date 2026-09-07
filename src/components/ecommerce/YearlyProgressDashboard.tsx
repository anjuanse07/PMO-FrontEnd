import { useEffect, useMemo, useState, Fragment } from "react";
import ComponentCard from "../common/ComponentCard";
import MonthlyCompletionBreakdown from "./MonthlyCompletionBreakdown";
import Badge from "../ui/badge/Badge";
import { type MachineSub } from "../../data/preventiveMaintenanceData";
import { useSchedules, useApprovedOrders } from "../../hooks/useScheduleData";
import {
  fetchMachines,
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
  /** Month to show (0-11), or "All" for the full year. In standalone mode this also
   *  seeds the internal selector. */
  month?: number | "All";
  /** Show the built-in Year/Month dropdowns. Set false when the parent page already has one. */
  showYearSelector?: boolean;
  /** Pass these three together to run in controlled mode (no internal fetch). */
  machines?: MachineRecord[];
  schedules?: ScheduleRecord[];
  orders?: ApprovedOrderRecord[];
  isLoading?: boolean;
  title?: string;
  /** Show the "Monthly Completion Breakdown" table. Default true.
   *  Set false when it's rendered separately elsewhere on the page
   *  (e.g. next to YearlyScheduleMatrixPreview in Home.tsx) to avoid
   *  showing it twice. */
  showBreakdown?: boolean;
  /** Show the full-width "Overall Progress" bar. Default true. */
  showOverallProgress?: boolean;
  /** Show the BLD/UTY/MTC group cards. Default true. */
  showGroupCards?: boolean;
  /** When true, renders with no wrapping box and the group cards use
   *  `display: contents` instead of their own grid, so - combined with
   *  showOverallProgress={false} and showBreakdown={false} - the three
   *  group cards become plain siblings that drop directly into a parent
   *  grid (e.g. to sit in the same row as other dashboard cards). */
  asGridItems?: boolean;
}

export default function YearlyProgressDashboard({
  year,
  month,
  showYearSelector = true,
  machines: machinesProp,
  schedules: schedulesProp,
  orders: ordersProp,
  isLoading: isLoadingProp,
  title = "Preventive Maintenance Progress",
  showBreakdown = true,
  showOverallProgress = true,
  showGroupCards = true,
  asGridItems = false,
}: YearlyProgressDashboardProps) {
  const isControlled = machinesProp !== undefined && schedulesProp !== undefined && ordersProp !== undefined;

  const [selectedYear, setSelectedYear] = useState(year ?? new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number | "All">("All");
  const [machineRecords, setMachineRecords] = useState<MachineRecord[]>([]);
  const [isLoadingMachines, setIsLoadingMachines] = useState(!isControlled);
  // Unscoped ("All" years) - yearOptions further down needs to see every
  // year that has ever had schedule/order data, not just one specific year.
  // Only used in standalone mode; in controlled mode the props below win
  // via the effective* ternaries regardless of what this returns.
  const { schedules: fetchedSchedules, isLoadingSchedules } = useSchedules("All");
  const { orders: fetchedOrders, isLoadingOrders } = useApprovedOrders("All");

  useEffect(() => {
    if (year !== undefined) setSelectedYear(year);
  }, [year]);

  useEffect(() => {
    if (month !== undefined) setSelectedMonth(month);
  }, [month]);

  useEffect(() => {
    if (isControlled) return;

    const loadMachines = async () => {
      try {
        setIsLoadingMachines(true);
        const machinesData = await fetchMachines();
        setMachineRecords(machinesData);
      } catch (error) {
        console.error("Failed to load yearly progress dashboard data:", error);
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

  // machine_no -> child sub (e.g. "MTC 1"), falling back to the main sub
  // label itself when sub_child hasn't been backfilled yet.
  const childSubByMachineId = useMemo(() => {
    const map = new Map<string, string>();
    for (const machine of effectiveMachines) {
      map.set(String(machine.no), machine.sub_child || machine.kategori);
    }
    return map;
  }, [effectiveMachines]);

  // Which child subs actually exist under each main sub - BLD (no real
  // split) never shows a breakdown, MTC/UTY only list child subs in use.
  const childSubsByMainSub = useMemo(() => {
    const seen: Record<MachineSub, Set<string>> = { BLD: new Set(), UTY: new Set(), MTC: new Set() };
    for (const machine of effectiveMachines) {
      const main = machine.kategori as MachineSub;
      if (!seen[main]) continue;
      seen[main].add(machine.sub_child || machine.kategori);
    }
    const result: Record<MachineSub, string[]> = { BLD: [], UTY: [], MTC: [] };
    for (const key of Object.keys(seen) as MachineSub[]) {
      result[key] = Array.from(seen[key]).sort();
    }
    return result;
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

    // Keyed directly by child sub label (e.g. "MTC 1"), for the per-card breakdown.
    const perChildSub: Record<string, { scheduled: number; completed: number }> = {};
    const perChildSubMonth: Record<string, { scheduled: number; completed: number }[]> = {};
    const ensureChild = (key: string) => {
      if (!perChildSub[key]) perChildSub[key] = { scheduled: 0, completed: 0 };
      if (!perChildSubMonth[key]) perChildSubMonth[key] = monthAbbrev.map(() => ({ scheduled: 0, completed: 0 }));
    };

    for (const sched of effectiveSchedules) {
      if (sched.tahun !== selectedYear) continue;
      const sub = sched.sub ?? subByMachineId.get(String(sched.machine_no));
      if (sub && perSub[sub]) {
        perSub[sub].scheduled += 1;
        if (sched.bulan >= 0 && sched.bulan < 12) perSubMonth[sub][sched.bulan].scheduled += 1;
      }
      const childSub = childSubByMachineId.get(String(sched.machine_no));
      if (childSub) {
        ensureChild(childSub);
        perChildSub[childSub].scheduled += 1;
        if (sched.bulan >= 0 && sched.bulan < 12) perChildSubMonth[childSub][sched.bulan].scheduled += 1;
      }
    }

    for (const order of effectiveOrders) {
      if (order.year !== selectedYear || order.status !== "Completed") continue;
      const sub = order.sub ?? subByMachineId.get(String(order.machine_no));
      if (sub && perSub[sub]) {
        perSub[sub].completed += 1;
        if (order.month >= 0 && order.month < 12) perSubMonth[sub][order.month].completed += 1;
      }
      const childSub = childSubByMachineId.get(String(order.machine_no));
      if (childSub) {
        ensureChild(childSub);
        perChildSub[childSub].completed += 1;
        if (order.month >= 0 && order.month < 12) perChildSubMonth[childSub][order.month].completed += 1;
      }
    }

    return { perSub, perSubMonth, perChildSub, perChildSubMonth };
  }, [effectiveSchedules, effectiveOrders, subByMachineId, childSubByMachineId, selectedYear]);


  const overallStats = useMemo(() => {
    if (selectedMonth === "All") {
      return Object.values(dashboardStats.perSub).reduce(
        (acc, cur) => ({
          scheduled: acc.scheduled + cur.scheduled,
          completed: acc.completed + cur.completed,
        }),
        { scheduled: 0, completed: 0 },
      );
    }
    // A specific month is selected - sum that month's cell across BLD/UTY/MTC
    // instead of the whole year, same as the per-group cards below already do.
    return subTabs.reduce(
      (acc, tab) => {
        const cell = dashboardStats.perSubMonth[tab.key][selectedMonth];
        return {
          scheduled: acc.scheduled + cell.scheduled,
          completed: acc.completed + cell.completed,
        };
      },
      { scheduled: 0, completed: 0 },
    );
  }, [dashboardStats, selectedMonth]);

  const pct = (completed: number, scheduled: number) =>
    scheduled === 0 ? 0 : Math.min(100, Math.round((completed / scheduled) * 100));

  const Wrapper = asGridItems ? Fragment : "div";
  const wrapperProps = asGridItems ? {} : { className: "space-y-6" };

  return (
    <Wrapper {...wrapperProps}>
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

      {showOverallProgress && (
        <ComponentCard
          title={`Overall Progress - ${selectedMonth === "All" ? selectedYear : `${monthAbbrev[selectedMonth]} ${selectedYear}`}`}
        >
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
      )}

      {showGroupCards && (
      <div className={asGridItems ? "contents" : "grid gap-4 md:grid-cols-3"}>
        {subTabs.map((tab) => {
          const stat =
            selectedMonth === "All" ? dashboardStats.perSub[tab.key] : dashboardStats.perSubMonth[tab.key][selectedMonth];
          const percent = pct(stat.completed, stat.scheduled);
          const childSubs = childSubsByMainSub[tab.key] ?? [];
          const showChildBreakdown = childSubs.length > 1;
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

              {showChildBreakdown && (
                <div className="mt-3 space-y-2 border-t border-gray-100 pt-3 dark:border-white/[0.05]">
                  {childSubs.map((childSub) => {
                    const childStat =
                      selectedMonth === "All"
                        ? dashboardStats.perChildSub[childSub] ?? { scheduled: 0, completed: 0 }
                        : dashboardStats.perChildSubMonth[childSub]?.[selectedMonth] ?? { scheduled: 0, completed: 0 };
                    const childPercent = pct(childStat.completed, childStat.scheduled);
                    return (
                      <div key={childSub}>
                        <div className="mb-1 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                          <span>{childSub}</span>
                          <span>
                            {childStat.completed}/{childStat.scheduled} ({childPercent}%)
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                          <div
                            className={`h-full rounded-full ${
                              childPercent >= 80 ? "bg-green-400" : childPercent >= 50 ? "bg-brand-400" : "bg-yellow-300"
                            }`}
                            style={{ width: `${childPercent}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ComponentCard>
          );
        })}
      </div>
      )}

      {showBreakdown && (
        <MonthlyCompletionBreakdown
          machines={effectiveMachines}
          schedules={effectiveSchedules}
          orders={effectiveOrders}
          isLoading={effectiveLoading}
          year={selectedYear}
          showYearSelector={false}
        />
      )}
    </Wrapper>
  );
}
