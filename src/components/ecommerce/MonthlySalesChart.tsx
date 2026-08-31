import { useEffect, useMemo, useState } from "react";
import Chart from "react-apexcharts";
import { ApexOptions } from "apexcharts";
import Badge from "../ui/badge/Badge";
import {
  fetchSchedules,
  fetchApprovedOrders,
  type ScheduleRecord,
  type ApprovedOrderRecord,
} from "../../services/pmoApi";

const monthNames = [
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

interface MonthlySalesChartProps {
  /** Year to show. When provided, the internal Year dropdown is hidden and this value drives the chart. */
  year?: number;
  /** Show the built-in Year dropdown. Set false when the parent page already has a shared one. */
  showYearSelector?: boolean;
}

export default function MonthlySalesChart({ year, showYearSelector = true }: MonthlySalesChartProps) {
  const [selectedYear, setSelectedYear] = useState(year ?? new Date().getFullYear());
  const [schedules, setSchedules] = useState<ScheduleRecord[]>([]);
  const [orders, setOrders] = useState<ApprovedOrderRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (year !== undefined) setSelectedYear(year);
  }, [year]);

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        const [scheduleRows, orderRows] = await Promise.all([fetchSchedules(), fetchApprovedOrders()]);
        setSchedules(scheduleRows);
        setOrders(orderRows);
      } catch (error) {
        console.error("Failed to load monthly plan vs completed chart data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    void loadData();
  }, []);

  // Year filter reflects whatever years actually have schedule or order data,
  // plus the current year so the dropdown is never empty before data loads.
  const yearOptions = useMemo(() => {
    const years = new Set<number>();
    schedules.forEach((sched) => years.add(sched.tahun));
    orders.forEach((order) => years.add(order.year));
    years.add(new Date().getFullYear());
    years.add(selectedYear);
    return Array.from(years).sort((a, b) => a - b);
  }, [schedules, orders, selectedYear]);

  // Planned = every scheduled preventive entry for the year, by month
  // Completed = scheduled entries whose approved order has reached "Completed", by month
  const { plannedByMonth, completedByMonth } = useMemo(() => {
    const planned = Array(12).fill(0);
    const completed = Array(12).fill(0);

    for (const sched of schedules) {
      if (sched.tahun !== selectedYear) continue;
      if (sched.bulan >= 0 && sched.bulan < 12) planned[sched.bulan] += 1;
    }

    for (const order of orders) {
      if (order.year !== selectedYear || order.status !== "Completed") continue;
      if (order.month >= 0 && order.month < 12) completed[order.month] += 1;
    }

    return { plannedByMonth: planned, completedByMonth: completed };
  }, [schedules, orders, selectedYear]);

  // Overall completion rate for the whole selected year (sum of months)
  const overallCompletionRate = useMemo(() => {
    const totalPlanned = plannedByMonth.reduce((sum, val) => sum + val, 0);
    const totalCompleted = completedByMonth.reduce((sum, val) => sum + val, 0);
    return totalPlanned === 0 ? 0 : Math.round((totalCompleted / totalPlanned) * 100);
  }, [plannedByMonth, completedByMonth]);

  const options: ApexOptions = {
    colors: ["#465fff", "#12B76A"],
    chart: {
      fontFamily: "Outfit, sans-serif",
      type: "bar",
      height: 180,
      toolbar: {
        show: false,
      },
    },
    plotOptions: {
      bar: {
        horizontal: false,
        columnWidth: "55%",
        borderRadius: 5,
        borderRadiusApplication: "end",
      },
    },
    dataLabels: {
      enabled: false,
    },
    stroke: {
      show: true,
      width: 4,
      colors: ["transparent"],
    },
    xaxis: {
      categories: monthNames,
      axisBorder: {
        show: false,
      },
      axisTicks: {
        show: false,
      },
    },
    legend: {
      show: true,
      position: "top",
      horizontalAlign: "left",
      fontFamily: "Outfit",
    },
    yaxis: {
      title: {
        text: undefined,
      },
      labels: {
        formatter: (val: number) => `${Math.round(val)}`,
      },
    },
    grid: {
      yaxis: {
        lines: {
          show: true,
        },
      },
    },
    fill: {
      opacity: 1,
    },

    tooltip: {
      shared: true,
      intersect: false,
      custom: ({ series, dataPointIndex, w }: { series: number[][]; dataPointIndex: number; w: any }) => {
        const planned = series[0]?.[dataPointIndex] ?? 0;
        const completedVal = series[1]?.[dataPointIndex] ?? 0;
        const rate = planned === 0 ? 0 : Math.round((completedVal / planned) * 100);
        const monthLabel = w.globals.labels[dataPointIndex];
        return `
          <div style="min-width:190px;padding:12px 14px;font-family:Outfit, sans-serif;background:#fff;border-radius:8px;">
            <div style="font-weight:600;font-size:13px;color:#1D2939;margin-bottom:8px;">${monthLabel} ${selectedYear}</div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
              <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:#475467;">
                <span style="width:8px;height:8px;border-radius:9999px;background:#465fff;display:inline-block;"></span>
                Planned
              </span>
              <span style="font-weight:600;font-size:13px;color:#1D2939;">${planned}</span>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
              <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:#475467;">
                <span style="width:8px;height:8px;border-radius:9999px;background:#12B76A;display:inline-block;"></span>
                Completed
              </span>
              <span style="font-weight:600;font-size:13px;color:#1D2939;">${completedVal}</span>
            </div>
            <div style="border-top:1px solid #EAECF0;padding-top:6px;font-size:11.5px;color:#667085;">
              Completion rate ${rate}%
            </div>
          </div>
        `;
      },
    },
  };

  const series = [
    { name: "Planned", data: plannedByMonth },
    { name: "Completed", data: completedByMonth },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white px-5 pt-5 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6 sm:pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              Monthly Preventive Plan vs Completed
            </h3>
            <Badge size="sm" color={overallCompletionRate >= 80 ? "success" : overallCompletionRate >= 50 ? "primary" : "warning"}>
              {overallCompletionRate}% completion rate
            </Badge>
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Scheduled actions compared to what was completed, per month
          </p>
        </div>
        {showYearSelector && (
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          >
            {yearOptions.map((yr) => (
              <option key={yr} value={yr}>
                {yr}
              </option>
            ))}
          </select>
        )}
      </div>

      {isLoading && (
        <div className="mt-3 text-xs italic text-gray-400 dark:text-gray-500">Loading chart data...</div>
      )}

      <div className="max-w-full overflow-x-auto custom-scrollbar">
        <div className="-ml-5 min-w-[650px] xl:min-w-full pl-2">
          <Chart options={options} series={series} type="bar" height={180} />
        </div>
      </div>
    </div>
  );
}
