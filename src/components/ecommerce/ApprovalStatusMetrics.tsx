import { useEffect, useMemo, useState } from "react";
import { TaskIcon } from "../../icons";
import Badge from "../ui/badge/Badge";
import { fetchApprovedOrders, type ApprovedOrderRecord } from "../../services/pmoApi";

/**
 * Counts, for the current year's approved orders, how many have reached each
 * of the 3 sign-off stages (Technician -> Machine User/PIC -> Engineering).
 * Percentages are relative to the total number of orders created this year.
 */
export default function ApprovalStatusMetrics() {
  const [orders, setOrders] = useState<ApprovedOrderRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const currentYear = useMemo(() => new Date().getFullYear(), []);

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

  const { totalOrders, technicianApproved, picApproved, engineeringApproved } = useMemo(() => {
    const yearOrders = orders.filter((o) => o.year === currentYear);
    return {
      totalOrders: yearOrders.length,
      technicianApproved: yearOrders.filter((o) => Boolean(o.approved_by_technician_date)).length,
      picApproved: yearOrders.filter((o) => Boolean(o.approved_by_pic_date)).length,
      engineeringApproved: yearOrders.filter((o) => Boolean(o.approved_by_engineering_date)).length,
    };
  }, [orders, currentYear]);

  const pct = (count: number) => (totalOrders === 0 ? 0 : Math.round((count / totalOrders) * 100));

  const cards = [
    {
      key: "technician",
      label: "Approved by Technician",
      count: technicianApproved,
      icon: TaskIcon,
    },
    {
      key: "pic",
      label: "Approved by User",
      count: picApproved,
      icon: TaskIcon,
    },
    {
      key: "engineering",
      label: "Approved by Engineering",
      count: engineeringApproved,
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
              <Badge color={percent >= 80 ? "success" : percent >= 50 ? "primary" : "warning"}>
                {isLoading ? "--" : `${percent}%`} of {totalOrders}
              </Badge>
            </div>
          </div>
        );
      })}
    </div>
  );
}
