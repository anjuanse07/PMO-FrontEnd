import { useEffect, useMemo, useState } from "react";
import EcommerceMetrics from "../../components/ecommerce/EcommerceMetrics";
import ApprovalStatusMetrics from "../../components/ecommerce/ApprovalStatusMetrics";
import SchedulePlanningStatusMetrics from "../../components/ecommerce/SchedulePlanningStatusMetrics";
import TechnicianWorkloadTable from "../../components/ecommerce/TechnicianWorkloadTable";
import MonthlySalesChart from "../../components/ecommerce/MonthlySalesChart";
// import StatisticsChart from "../../components/ecommerce/StatisticsChart";
import MonthlyTarget from "../../components/ecommerce/MonthlyTarget";
// import RecentOrders from "../../components/ecommerce/RecentOrders";
// import DemographicCard from "../../components/ecommerce/DemographicCard";
import YearlyProgressDashboard from "../../components/ecommerce/YearlyProgressDashboard";
import YearlyScheduleMatrixPreview from "../../components/ecommerce/YearlyScheduleMatrixPreview";
import UpcomingPreventiveSchedulePreview from "../../components/ecommerce/UpcomingPreventiveSchedulePreview";
import MonthlyCompletionBreakdown from "../../components/ecommerce/MonthlyCompletionBreakdown";
import PageMeta from "../../components/common/PageMeta";
import {
  fetchSchedules,
  fetchApprovedOrders,
  type ScheduleRecord,
  type ApprovedOrderRecord,
} from "../../services/pmoApi";

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function Home() {
  // Single shared Year/Month filter for the whole dashboard. Every panel below
  // reads from this instead of keeping its own selector, so picking a year or
  // month here updates every card, chart, and table together.
  const thisYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(thisYear);
  const [selectedMonth, setSelectedMonth] = useState<number | "All">("All");

  // Lightweight fetch of schedules/orders here purely to know which years
  // actually have data, so the Year dropdown only lists real years instead
  // of a fixed guessed range. Each panel below still does its own fetch for
  // its own data - this doesn't replace that.
  const [yearProbeSchedules, setYearProbeSchedules] = useState<ScheduleRecord[]>([]);
  const [yearProbeOrders, setYearProbeOrders] = useState<ApprovedOrderRecord[]>([]);

  useEffect(() => {
    const loadYears = async () => {
      try {
        const [scheduleRows, orderRows] = await Promise.all([fetchSchedules(), fetchApprovedOrders()]);
        setYearProbeSchedules(scheduleRows);
        setYearProbeOrders(orderRows);
      } catch (error) {
        console.error("Failed to load year options for dashboard filter:", error);
      }
    };
    void loadYears();
  }, []);

  const yearOptions = useMemo(() => {
    const years = new Set<number>();
    yearProbeSchedules.forEach((sched) => years.add(sched.tahun));
    yearProbeOrders.forEach((order) => years.add(order.year));
    years.add(thisYear);
    years.add(selectedYear);
    return Array.from(years).sort((a, b) => a - b);
  }, [yearProbeSchedules, yearProbeOrders, thisYear, selectedYear]);

  return (
    <>
      <PageMeta
        title="Preventive Maintenance Online"
        description="This is Sean Julius Lase's Model"
      />
      <div className="grid grid-cols-12 gap-4 md:gap-6">
        {/* Shared filter bar - drives every panel on this page */}
        <div className="col-span-12">
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Dashboard filters:</span>
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              <span>Year</span>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              >
                {yearOptions.map((yr) => (
                  <option key={yr} value={yr}>
                    {yr}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              <span>Month</span>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value === "All" ? "All" : Number(e.target.value))}
                className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              >
                <option value="All">Full Year</option>
                {monthNames.map((m, idx) => (
                  <option key={m} value={idx}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {/* Yearly preventive maintenance progress - full width, top of dashboard.
            The Monthly Completion Breakdown table is pulled out and rendered
            further down, paired with the Monthly Sales Chart. The group
            cards (BLD/UTY/MTC) are pulled out too, and rendered below in
            the same row as the Plan / Not Yet Completed tiles. */}
        <div className="col-span-12">
          <YearlyProgressDashboard
            year={selectedYear}
            month={selectedMonth}
            showYearSelector={false}
            showBreakdown={false}
            showGroupCards={false}
          />
        </div>

        {/* Quick stat tiles: BLD/UTY/MTC group progress alongside Plan /
            Not Yet Completed, all in one row so they're easy to compare
            at a glance. Both components render "flattened" (no wrapping
            grid of their own) so their cards become plain siblings inside
            this single shared grid. */}
        <div className="col-span-12 grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-3 xl:grid-cols-5">
          <YearlyProgressDashboard
            year={selectedYear}
            month={selectedMonth}
            showYearSelector={false}
            showOverallProgress={false}
            showBreakdown={false}
            asGridItems
          />
          <EcommerceMetrics year={selectedYear} month={selectedMonth} className="contents" />
        </div>

        {/* Approval pipelines: planning (yearly schedule) vs execution (order sign-off).
            Each gets its own card so the two pipelines stay visually distinct
            even though they now share one row on larger screens. Split 2:3
            (not a flat 1:1) since Schedule Planning has 2 inner cards and
            Order Execution has 3 - this makes every individual stat card the
            same width instead of Schedule Planning's cards being wider. */}
        <div className="col-span-12 grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-5">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6 xl:col-span-2">
            <h3 className="mb-3 text-base font-semibold text-gray-800 dark:text-white/90">
              Schedule Planning Approvals ({selectedYear})
            </h3>
            <SchedulePlanningStatusMetrics year={selectedYear} month={selectedMonth} />
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6 xl:col-span-3">
            <h3 className="mb-3 text-base font-semibold text-gray-800 dark:text-white/90">
              Order Execution Approvals ({selectedYear})
            </h3>
            <ApprovalStatusMetrics year={selectedYear} month={selectedMonth} />
          </div>
        </div>

        {/* Monthly Preventive Plan vs Completed chart, with the Monthly
            Completion Breakdown table stacked directly beneath it.
            Monthly Target sits alongside and stretches (xl:items-stretch)
            to match the combined height of both stacked cards. */}
        <div className="col-span-12 grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-12 xl:items-stretch">
          <div className="flex flex-col gap-4 md:gap-6 xl:col-span-7">
            <MonthlySalesChart year={selectedYear} showYearSelector={false} />
            <MonthlyCompletionBreakdown year={selectedYear} showYearSelector={false} />
          </div>

          <div className="xl:col-span-5">
            <MonthlyTarget year={selectedYear} month={selectedMonth} showSelectors={false} />
          </div>
        </div>

        {/* Yearly Schedule Matrix preview, side by side with the Yearly
            Preventive Schedule preview. */}
        <div className="col-span-12 xl:col-span-6">
          <YearlyScheduleMatrixPreview year={selectedYear} month={selectedMonth} showMonthSelector={false} />
        </div>

        <div className="col-span-12 xl:col-span-6">
          <UpcomingPreventiveSchedulePreview year={selectedYear} month={selectedMonth} />
        </div>

        {/* Technician workload: by role and ranked, full width */}
        <div className="col-span-12">
          <TechnicianWorkloadTable year={selectedYear} month={selectedMonth} showYearSelector={false} />
        </div>

        {/* <div className="col-span-12">
          <StatisticsChart />
        </div> */}

        {/* <div className="col-span-12 xl:col-span-5">
          <DemographicCard />
        </div>

        <div className="col-span-12 xl:col-span-7">
          <RecentOrders />
        </div> */}
      </div>
    </>
  );
}
