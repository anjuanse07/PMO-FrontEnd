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

export default function Home() {
  return (
    <>
      <PageMeta
        title="Preventive Maintenance Online"
        description="This is Sean Julius Lase's Model"
      />
      <div className="grid grid-cols-12 gap-4 md:gap-6">
        {/* Yearly preventive maintenance progress - full width, top of dashboard.
            The Monthly Completion Breakdown table is pulled out and rendered
            further down, paired with the Yearly Schedule Matrix preview. */}
        <div className="col-span-12">
          <YearlyProgressDashboard showBreakdown={false} />
        </div>

        {/* Quick stat tiles */}
        <div className="col-span-12">
          <EcommerceMetrics />
        </div>

        {/* Approval pipelines: planning (yearly schedule) vs execution (order sign-off).
            Kept as two clearly-labeled full-width rows rather than squeezed
            side-by-side, since each is already a 3-card row on its own. */}
        <div className="col-span-12">
          <h3 className="mb-3 text-base font-semibold text-gray-800 dark:text-white/90">
            Schedule Planning Approvals ({new Date().getFullYear()})
          </h3>
          <SchedulePlanningStatusMetrics />
        </div>

        <div className="col-span-12">
          <h3 className="mb-3 text-base font-semibold text-gray-800 dark:text-white/90">
            Order Execution Approvals ({new Date().getFullYear()})
          </h3>
          <ApprovalStatusMetrics />
        </div>

        {/* Monthly Preventive Plan vs Completed chart, with the Yearly
            Preventive Schedule preview stacked directly beneath it.
            Monthly Target sits alongside and stretches (xl:items-stretch)
            to match the combined height of both stacked cards. */}
        <div className="col-span-12 grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-12 xl:items-stretch">
          <div className="flex flex-col gap-4 md:gap-6 xl:col-span-7">
            <MonthlySalesChart />
            <UpcomingPreventiveSchedulePreview />
          </div>

          <div className="xl:col-span-5">
            <MonthlyTarget />
          </div>
        </div>

        {/* Yearly Schedule Matrix preview, side by side with the Monthly
            Completion Breakdown table. */}
        <div className="col-span-12 xl:col-span-6">
          <YearlyScheduleMatrixPreview />
        </div>

        <div className="col-span-12 xl:col-span-6">
          <MonthlyCompletionBreakdown />
        </div>

        {/* Technician workload: by role and ranked, full width */}
        <div className="col-span-12">
          <TechnicianWorkloadTable />
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
