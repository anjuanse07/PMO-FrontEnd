import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import ComponentCard from "../common/ComponentCard";
import Badge from "../ui/badge/Badge";
import { fetchSchedules, type ScheduleRecord } from "../../services/pmoApi";

/**
 * Compact dashboard preview of the full YearlyPreventiveSchedule.tsx page.
 * Rather than the full editable planning table, this surfaces the entries
 * that still need an approval action (Draft or Approved by Engineering),
 * soonest-scheduled first, so whoever opens the dashboard can see at a
 * glance what's waiting on them.
 *
 * NOTE: update the `to="/yearly-preventive-schedule"` path below once that
 * page is registered in the router if the route differs.
 */

const monthAbbrev = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const ROWS_LIMIT = 6;

export default function UpcomingPreventiveSchedulePreview() {
  const [schedules, setSchedules] = useState<ScheduleRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        const scheduleRows = await fetchSchedules();
        setSchedules(scheduleRows);
      } catch (error) {
        console.error("Failed to load upcoming preventive schedule preview data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    void loadData();
  }, []);

  const pendingEntries = useMemo(() => {
    return schedules
      .filter((s) => s.status === "Draft" || s.status === "Approved by Engineering")
      .sort((a, b) => {
        if (a.tahun !== b.tahun) return a.tahun - b.tahun;
        if (a.bulan !== b.bulan) return a.bulan - b.bulan;
        return a.minggu - b.minggu;
      })
      .slice(0, ROWS_LIMIT);
  }, [schedules]);

  const pendingCount = useMemo(
    () => schedules.filter((s) => s.status === "Draft" || s.status === "Approved by Engineering").length,
    [schedules],
  );

  return (
    <ComponentCard title="Yearly Preventive Schedule">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-gray-600 dark:text-gray-300">
          {isLoading ? "--" : pendingCount} entr{pendingCount === 1 ? "y" : "ies"} awaiting approval
        </span>
        <Link
          to="/yearly-preventive-schedule"
          className="text-sm font-medium text-brand-500 hover:text-brand-600 dark:text-brand-400"
        >
          View Full Schedule &rarr;
        </Link>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-gray-50 dark:bg-gray-800/60">
            <tr>
              <th className="px-3 py-2 font-semibold uppercase text-gray-600 dark:text-gray-300">Asset</th>
              <th className="px-3 py-2 font-semibold uppercase text-gray-600 dark:text-gray-300">Group</th>
              <th className="px-3 py-2 font-semibold uppercase text-gray-600 dark:text-gray-300">When</th>
              <th className="px-3 py-2 font-semibold uppercase text-gray-600 dark:text-gray-300">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
            {pendingEntries.map((entry) => (
              <tr key={entry.id}>
                <td className="px-3 py-2 text-gray-700 dark:text-gray-200">
                  <div className="font-medium">{entry.machine_asset ?? entry.machine_no}</div>
                  <div className="text-[10px] text-gray-400 dark:text-gray-500">{entry.machine_name}</div>
                </td>
                <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{entry.sub}</td>
                <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                  {monthAbbrev[entry.bulan]} {entry.tahun}, W{entry.minggu}
                </td>
                <td className="px-3 py-2">
                  <Badge size="sm" color={entry.status === "Draft" ? "warning" : "primary"}>
                    {entry.status}
                  </Badge>
                </td>
              </tr>
            ))}
            {!isLoading && pendingEntries.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-gray-400">
                  Nothing pending approval right now.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {isLoading && <div className="mt-3 text-xs italic text-gray-400 dark:text-gray-500">Loading...</div>}
    </ComponentCard>
  );
}
