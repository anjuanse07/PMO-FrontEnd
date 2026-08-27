import { useEffect, useMemo, useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, BoxIconLine, GroupIcon } from "../../icons";
import Badge from "../ui/badge/Badge";
import {
  fetchSchedules,
  fetchApprovedOrders,
  type ScheduleRecord,
  type ApprovedOrderRecord,
} from "../../services/pmoApi";

export default function EcommerceMetrics() {
  const [schedules, setSchedules] = useState<ScheduleRecord[]>([]);
  const [orders, setOrders] = useState<ApprovedOrderRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const currentYear = useMemo(() => new Date().getFullYear(), []);

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        const [scheduleRows, orderRows] = await Promise.all([fetchSchedules(), fetchApprovedOrders()]);
        setSchedules(scheduleRows);
        setOrders(orderRows);
      } catch (error) {
        console.error("Failed to load ecommerce metrics data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    void loadData();
  }, []);

  // Yearly Plan (Total) = every scheduled preventive entry for the current year
  // Not Yet Completed = scheduled entries whose approved order hasn't reached "Completed" yet
  const { totalPlan, pendingCount, completedPct, pendingPct } = useMemo(() => {
    const total = schedules.filter((s) => s.tahun === currentYear).length;
    const completedCount = orders.filter((o) => o.year === currentYear && o.status === "Completed").length;
    const pending = Math.max(0, total - completedCount);
    const donePct = total === 0 ? 0 : Math.round((completedCount / total) * 100);
    const pendPct = total === 0 ? 0 : Math.round((pending / total) * 100);
    return { totalPlan: total, pendingCount: pending, completedPct: donePct, pendingPct: pendPct };
  }, [schedules, orders, currentYear]);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6">
      {/* <!-- Metric Item Start --> */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
        <div className="flex items-center justify-center w-12 h-12 bg-gray-100 rounded-xl dark:bg-gray-800">
          <GroupIcon className="text-gray-800 size-6 dark:text-white/90" />
        </div>

        <div className="flex items-end justify-between mt-5">
          <div>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Yearly Plan ({currentYear})
            </span>
            <h4 className="mt-2 font-bold text-gray-800 text-title-sm dark:text-white/90">
              {isLoading ? "--" : totalPlan.toLocaleString()}
            </h4>
          </div>
          <Badge color={completedPct >= 80 ? "success" : "warning"}>
            <ArrowUpIcon />
            {isLoading ? "--" : `${completedPct}%`} done
          </Badge>
        </div>
      </div>
      {/* <!-- Metric Item End --> */}

      {/* <!-- Metric Item Start --> */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
        <div className="flex items-center justify-center w-12 h-12 bg-gray-100 rounded-xl dark:bg-gray-800">
          <BoxIconLine className="text-gray-800 size-6 dark:text-white/90" />
        </div>
        <div className="flex items-end justify-between mt-5">
          <div>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Not Yet Completed
            </span>
            <h4 className="mt-2 font-bold text-gray-800 text-title-sm dark:text-white/90">
              {isLoading ? "--" : pendingCount.toLocaleString()}
            </h4>
          </div>

          <Badge color={pendingPct >= 50 ? "error" : "warning"}>
            <ArrowDownIcon />
            {isLoading ? "--" : `${pendingPct}%`} pending
          </Badge>
        </div>
      </div>
      {/* <!-- Metric Item End --> */}
    </div>
  );
}
