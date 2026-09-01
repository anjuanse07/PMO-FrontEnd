import { useEffect, useMemo, useState } from "react";
import { TaskIcon } from "../../icons";
import Badge from "../ui/badge/Badge";
import { fetchSchedules, type ScheduleRecord } from "../../services/pmoApi";

/**
 * Counts, for the current year's yearly-plan schedule entries, how many are
 * sitting at each gate of the PLANNING approval funnel RIGHT NOW:
 *   Draft -> Approved by Engineering -> Approved by Manager
 * (this is the approval flow driven from YearlyPreventiveSchedule.tsx, and
 * is a separate pipeline from the order EXECUTION approvals shown in
 * ApprovalStatusMetrics.tsx: Technician -> User/PIC -> Engineering.)
 *
 * Each card is an exclusive bucket, not a cumulative backlog: an entry only
 * counts toward one card, based on the stage it's currently stuck at.
 * "Pending Manager Approval" only counts entries that have already cleared
 * Engineering but not Manager - it does NOT include entries still stuck in
 * Draft (those count under "Draft (Pending Engineering)" instead). As a
 * result the three cards sum to (at most) totalEntries.
 *
 * Percentages are relative to the total number of schedule entries created
 * for the selected year (and month, if a specific month is selected via the
 * `month` prop instead of "All").
 */
interface SchedulePlanningStatusMetricsProps {
  /** Year to filter to. Defaults to the current calendar year. */
  year?: number;
  /** Month to filter to (0-11), or "All" for the full year. Defaults to "All". */
  month?: number | "All";
}

export default function SchedulePlanningStatusMetrics({ year, month = "All" }: SchedulePlanningStatusMetricsProps) {
  const [schedules, setSchedules] = useState<ScheduleRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const currentYear = year ?? new Date().getFullYear();

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        const scheduleRows = await fetchSchedules();
        setSchedules(scheduleRows);
      } catch (error) {
        console.error("Failed to load schedule planning status metrics data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    void loadData();
  }, []);

  const { totalEntries, draftCount, pendingEngineeringCount, pendingManagerCount } = useMemo(() => {
    const yearEntries = schedules.filter((s) => s.tahun === currentYear && (month === "All" || s.bulan === month));
    const isDraft = (s: ScheduleRecord) => s.status === "Draft";
    const isEngineeringApproved = (s: ScheduleRecord) => s.status === "Approved by Engineering";

    return {
      totalEntries: yearEntries.length,
      // Entries that haven't started the approval flow yet.
      draftCount: yearEntries.filter(isDraft).length,
      // Entries not yet approved by Engineering. Currently the same set as
      // draftCount, since there's no intermediate "in review" status - kept
      // as a separate derivation so it stays correct if one is added later.
      pendingEngineeringCount: yearEntries.filter(isDraft).length,
      // Exclusive: entries that have already cleared Engineering but not
      // yet Manager. Does NOT include entries still stuck in Draft - those
      // are counted under draftCount/pendingEngineeringCount instead.
      pendingManagerCount: yearEntries.filter(isEngineeringApproved).length,
    };
  }, [schedules, currentYear, month]);

  const pct = (count: number) => (totalEntries === 0 ? 0 : Math.round((count / totalEntries) * 100));

  const cards = [
    {
      key: "draft",
      label: "Draft (Pending Engineering)",
      count: draftCount,
      icon: TaskIcon,
    },
    {
      key: "pending-engineering",
      label: "Pending Engineering Approval",
      count: pendingEngineeringCount,
      icon: TaskIcon,
    },
    {
      key: "pending-manager",
      label: "Pending Manager Approval",
      count: pendingManagerCount,
      icon: TaskIcon,
    },
  ] as const;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 md:gap-6">
      {cards.map((card) => {
        const percent = pct(card.count);
        const Icon = card.icon;
        // All three cards now measure outstanding backlog at a gate, so a
        // high share is a warning sign across the board - no more flipping
        // the scale per card.
        const badgeColor = percent >= 50 ? "warning" : percent >= 20 ? "primary" : "success";
        return (
          <div
            key={card.key}
            className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6"
          >
            <div className="flex items-center justify-center w-12 h-12 bg-gray-100 rounded-xl dark:bg-gray-800">
              <Icon className="text-gray-800 size-6 dark:text-white/90" />
            </div>

            <div className="flex items-end justify-between mt-5">
              <div>
                <span className="text-sm text-gray-500 dark:text-gray-400">{card.label}</span>
                <h4 className="mt-2 font-bold text-gray-800 text-title-sm dark:text-white/90">
                  {isLoading ? "--" : card.count.toLocaleString()}
                </h4>
              </div>
              <Badge color={badgeColor}>
                {isLoading ? "--" : `${percent}%`} of {totalEntries}
              </Badge>
            </div>
          </div>
        );
      })}
    </div>
  );
}
