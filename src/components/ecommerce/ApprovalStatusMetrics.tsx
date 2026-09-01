import { useEffect, useMemo, useState } from "react";
import { TaskIcon } from "../../icons";
import Badge from "../ui/badge/Badge";
import { fetchApprovedOrders, type ApprovedOrderRecord } from "../../services/pmoApi";

/**
 * Counts, for the current year's approved orders, how many are sitting at
 * each of the 3 sign-off gates (Technician -> Machine User/PIC ->
 * Engineering) RIGHT NOW - each card is an exclusive bucket, not a
 * cumulative backlog: an order only counts toward one card at a time, based
 * on the first stage it hasn't cleared yet. E.g. an order that's already
 * cleared Technician but not User/PIC counts only in "Pending User/PIC
 * Approval", not in "Pending Technician Approval" too. As a result the
 * three cards DO sum to (at most) totalOrders, since every non-completed
 * order sits in exactly one bucket. Percentages are relative to the total
 * number of orders created this year.
 */
interface ApprovalStatusMetricsProps {
  /** Year to filter to. Defaults to the current calendar year. */
  year?: number;
  /** Month to filter to (0-11), or "All" for the full year. Defaults to "All". */
  month?: number | "All";
}

export default function ApprovalStatusMetrics({ year, month = "All" }: ApprovalStatusMetricsProps) {
  const [orders, setOrders] = useState<ApprovedOrderRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const currentYear = year ?? new Date().getFullYear();

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        const orderRows = await fetchApprovedOrders();
        setOrders(orderRows);
      } catch (error) {
        console.error("Failed to load approval status metrics data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    void loadData();
  }, []);

  const { totalOrders, pendingTechnician, pendingUser, pendingEngineering } = useMemo(() => {
    const scopedOrders = orders.filter((o) => o.year === currentYear && (month === "All" || o.month === month));
    const isTechnicianDone = (o: ApprovedOrderRecord) => Boolean(o.approved_by_technician_date);
    const isUserDone = (o: ApprovedOrderRecord) => Boolean(o.approved_by_pic_date);
    const isEngineeringDone = (o: ApprovedOrderRecord) => Boolean(o.approved_by_engineering_date);

    return {
      totalOrders: scopedOrders.length,
      // Hasn't cleared Technician yet - the first gate. Exclusive: an order
      // here can't also be counted in User/PIC or Engineering below.
      pendingTechnician: scopedOrders.filter((o) => !isTechnicianDone(o)).length,
      // Cleared Technician, but not yet User/PIC.
      pendingUser: scopedOrders.filter((o) => isTechnicianDone(o) && !isUserDone(o)).length,
      // Cleared both Technician and User/PIC, but not yet Engineering.
      pendingEngineering: scopedOrders.filter((o) => isTechnicianDone(o) && isUserDone(o) && !isEngineeringDone(o)).length,
    };
  }, [orders, currentYear, month]);

  const pct = (count: number) => (totalOrders === 0 ? 0 : Math.round((count / totalOrders) * 100));

  const cards = [
    {
      key: "technician",
      label: "Pending Technician Approval",
      count: pendingTechnician,
      icon: TaskIcon,
    },
    {
      key: "pic",
      label: "Pending User/PIC Approval",
      count: pendingUser,
      icon: TaskIcon,
    },
    {
      key: "engineering",
      label: "Pending Engineering Approval",
      count: pendingEngineering,
      icon: TaskIcon,
    },
  ] as const;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 md:gap-6">
      {cards.map((card) => {
        const percent = pct(card.count);
        const Icon = card.icon;
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
              <Badge color={percent >= 50 ? "warning" : percent >= 20 ? "primary" : "success"}>
                {isLoading ? "--" : `${percent}%`} of {totalOrders}
              </Badge>
            </div>
          </div>
        );
      })}
    </div>
  );
}
