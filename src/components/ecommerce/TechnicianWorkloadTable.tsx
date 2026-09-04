import { useEffect, useMemo, useState, Fragment } from "react";
import { useNavigate } from "react-router";
import { Modal } from "../ui/modal";
import Badge from "../ui/badge/Badge";
import {
  fetchApprovedOrders,
  fetchTechnicians,
  type ApprovedOrderRecord,
  type TechnicianRecord,
} from "../../services/pmoApi";

// Which technicians-table column to group by, matching the real schema hierarchy:
// detail_technician_role (Jabatan) -> technician_main_sub -> technician_child_sub.
// (Note: the `role` column itself is uniform ("Technician") and isn't a useful grouping.)
type GroupByField = "technician_main_sub" | "technician_child_sub" | "detail_technician_role";

const groupByOptions: { value: GroupByField; label: string }[] = [
  { value: "technician_main_sub", label: "Main Sub" },
  { value: "technician_child_sub", label: "Child Sub" },
  { value: "detail_technician_role", label: "Detail Role" },
];

type TechnicianStat = {
  planned: number;
  completed: number;
  hours: number;
  days: Set<string>;
};

type RoleMember = {
  technicianName: string;
  detailRole: string;
  planned: number;
  completed: number;
  due: number;
  rate: number;
};

type RoleSummary = {
  groupKey: string;
  members: RoleMember[];
  planned: number;
  completed: number;
  due: number;
  rate: number;
};

type RankedTechnician = {
  technicianName: string;
  detailRole: string;
  hours: number;
  days: number;
  planned: number;
};

// "08:00:00" / "17:30" -> hours between start and end, wrapping past midnight if needed
function clockDiffHours(start: string, end: string): number {
  const [sh = 0, sm = 0] = start.split(":").map(Number);
  const [eh = 0, em = 0] = end.split(":").map(Number);
  let diffMinutes = eh * 60 + em - (sh * 60 + sm);
  if (diffMinutes < 0) diffMinutes += 24 * 60;
  return diffMinutes / 60;
}

const dateOnlyFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

// Formats a date value (which may arrive as a plain "YYYY-MM-DD" or a full
// ISO timestamp like "2026-08-24T00:00:00.000Z") down to just the date.
function formatDateOnly(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.slice(0, 10) : dateOnlyFormatter.format(date);
}

// Extracts "YYYY-MM-DD" using the LOCAL timezone's calendar date, matching
// what formatDateOnly displays. A plain string.slice(0, 10) on a UTC ISO
// timestamp (e.g. "2026-10-19T17:00:00.000Z" for midnight Oct 20 in
// Jakarta/UTC+7) reads the UTC date, not the local one - one day off from
// what's shown on screen. Used for filter values, which must agree with it.
function toLocalDateValue(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// "Maulana Aldi Firmansyah" -> "MAF", "Nuryanto" -> "NUR"
function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return words
      .slice(0, 3)
      .map((w) => w[0])
      .join("")
      .toUpperCase();
  }
  return name.slice(0, 3).toUpperCase();
}

const rankBadgeStyle = (rank: number) => {
  if (rank === 1) return "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400";
  if (rank === 2) return "bg-gray-200 text-gray-700 dark:bg-gray-500/20 dark:text-gray-300";
  if (rank === 3) return "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400";
  return "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400";
};

// Same status -> badge color convention used elsewhere in the app
// (e.g. PreventiveMaintenanceOrder.tsx, HistoryLogs.tsx).
function statusBadgeColor(status: ApprovedOrderRecord["status"]): "warning" | "primary" | "success" {
  if (status === "In Progress") return "warning";
  if (status === "Approval") return "primary";
  return "success";
}

interface TechnicianWorkloadTableProps {
  /** Year to filter to. When provided, hides the internal Year dropdown. */
  year?: number;
  /** Month to filter to (0-11), or "All" for the full year. Defaults to "All". */
  month?: number | "All";
  /** Show the built-in Year dropdown. Set false when a parent page has a shared one. */
  showYearSelector?: boolean;
}

export default function TechnicianWorkloadTable({
  year,
  month = "All",
  showYearSelector = true,
}: TechnicianWorkloadTableProps) {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<ApprovedOrderRecord[]>([]);
  const [technicianRoster, setTechnicianRoster] = useState<TechnicianRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"role" | "ranking">("role");
  const [groupBy, setGroupBy] = useState<GroupByField>("technician_main_sub");
  const [selectedYear, setSelectedYear] = useState(year ?? new Date().getFullYear());
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set());
  const [selectedTechnician, setSelectedTechnician] = useState<string | null>(null);

  useEffect(() => {
    if (year !== undefined) setSelectedYear(year);
  }, [year]);

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        const [orderRows, technicianRows] = await Promise.all([fetchApprovedOrders(), fetchTechnicians()]);
        setOrders(orderRows);
        setTechnicianRoster(technicianRows);
      } catch (error) {
        console.error("Failed to load technician workload data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    void loadData();
  }, []);

  // Year filter reflects whatever years actually have order data, plus the current year
  const yearOptions = useMemo(() => {
    const years = new Set<number>();
    orders.forEach((order) => years.add(order.year));
    years.add(new Date().getFullYear());
    years.add(selectedYear);
    return Array.from(years).sort((a, b) => a - b);
  }, [orders, selectedYear]);

  const yearOrders = useMemo(
    () => orders.filter((o) => o.year === selectedYear && (month === "All" || o.month === month)),
    [orders, selectedYear, month],
  );

  // Per-technician raw stats, attributing each order to every technician named on it
  // (technician_name can hold multiple comma-separated names for a single order)
  const technicianStats = useMemo(() => {
    const map = new Map<string, TechnicianStat>();
    technicianRoster.forEach((t) => map.set(t.technician_name, { planned: 0, completed: 0, hours: 0, days: new Set() }));

    for (const order of yearOrders) {
      if (!order.technician_name) continue;
      const names = order.technician_name
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean);

      for (const name of names) {
        if (!map.has(name)) map.set(name, { planned: 0, completed: 0, hours: 0, days: new Set() });
        const stat = map.get(name)!;
        stat.planned += 1;
        if (order.status === "Completed") stat.completed += 1;
        if (order.start_clock && order.end_clock) {
          const hours = clockDiffHours(order.start_clock, order.end_clock);
          if (hours > 0) stat.hours += hours;
        }
        if (order.preventive_date) stat.days.add(order.preventive_date);
      }
    }

    return map;
  }, [yearOrders, technicianRoster]);

  // Grouped by the selected technicians-table field (Detail Role / Main Sub / Child Sub)
  const roleSummaries = useMemo<RoleSummary[]>(() => {
    const groups = new Map<string, RoleMember[]>();

    technicianRoster.forEach((t) => {
      const stat = technicianStats.get(t.technician_name) ?? { planned: 0, completed: 0, hours: 0, days: new Set() };
      const due = Math.max(0, stat.planned - stat.completed);
      const rate = stat.planned === 0 ? 0 : Math.round((stat.completed / stat.planned) * 100);
      const key = t[groupBy];
      const list = groups.get(key) ?? [];
      list.push({
        technicianName: t.technician_name,
        detailRole: t.detail_technician_role,
        planned: stat.planned,
        completed: stat.completed,
        due,
        rate,
      });
      groups.set(key, list);
    });

    return Array.from(groups.entries())
      .map(([groupKey, members]) => {
        const sortedMembers = [...members].sort((a, b) => b.planned - a.planned);
        const planned = members.reduce((sum, m) => sum + m.planned, 0);
        const completed = members.reduce((sum, m) => sum + m.completed, 0);
        const due = Math.max(0, planned - completed);
        const rate = planned === 0 ? 0 : Math.round((completed / planned) * 100);
        return { groupKey, members: sortedMembers, planned, completed, due, rate };
      })
      .sort((a, b) => b.planned - a.planned);
  }, [technicianRoster, technicianStats, groupBy]);

  const grandTotal = useMemo(() => {
    const planned = roleSummaries.reduce((sum, r) => sum + r.planned, 0);
    const completed = roleSummaries.reduce((sum, r) => sum + r.completed, 0);
    const due = Math.max(0, planned - completed);
    const rate = planned === 0 ? 0 : Math.round((completed / planned) * 100);
    return { planned, completed, due, rate, groupCount: roleSummaries.length, technicianCount: technicianRoster.length };
  }, [roleSummaries, technicianRoster]);

  // Flat ranking across all technicians, sorted by total hours worked (like "jam kerja")
  const ranking = useMemo<RankedTechnician[]>(() => {
    return technicianRoster
      .map((t) => {
        const stat = technicianStats.get(t.technician_name) ?? { planned: 0, completed: 0, hours: 0, days: new Set() };
        return {
          technicianName: t.technician_name,
          detailRole: t.detail_technician_role,
          hours: Math.round(stat.hours * 100) / 100,
          days: stat.days.size,
          planned: stat.planned,
        };
      })
      .sort((a, b) => b.hours - a.hours);
  }, [technicianRoster, technicianStats]);

  const maxHours = ranking[0]?.hours || 1;

  // Individual preventive entries for whichever technician's name is
  // clicked, most recent first - powers the "Detail Teknisi" modal.
  const selectedTechnicianOrders = useMemo(() => {
    if (!selectedTechnician) return [];
    return yearOrders
      .filter((order) =>
        (order.technician_name ?? "")
          .split(",")
          .map((n) => n.trim())
          .includes(selectedTechnician),
      )
      .sort((a, b) => (b.execution_date || b.preventive_date || "").localeCompare(a.execution_date || a.preventive_date || ""));
  }, [yearOrders, selectedTechnician]);

  const selectedTechnicianStat = selectedTechnician
    ? technicianStats.get(selectedTechnician) ?? { planned: 0, completed: 0, hours: 0, days: new Set<string>() }
    : { planned: 0, completed: 0, hours: 0, days: new Set<string>() };

  const toggleRole = (role: string) => {
    setExpandedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  };

  const rateColor = (rate: number) =>
    rate >= 90 ? "text-green-600 dark:text-green-400" : rate >= 70 ? "text-brand-600 dark:text-brand-400" : "text-yellow-600 dark:text-yellow-400";

  const groupByLabel = groupByOptions.find((opt) => opt.value === groupBy)?.label ?? "Detail Role";

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            {viewMode === "role" ? `Preventive Maintenance Workload by ${groupByLabel}` : "Technician Ranking"}
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {viewMode === "role"
              ? "Completion Rate = Completed ÷ Planned · click a group to see per-technician detail"
              : "Ranked by total hours worked"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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

          {viewMode === "role" && (
            <select
              value={groupBy}
              onChange={(e) => {
                setGroupBy(e.target.value as GroupByField);
                setExpandedRoles(new Set());
              }}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            >
              {groupByOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  Group by {opt.label}
                </option>
              ))}
            </select>
          )}

          <div className="flex rounded-lg border border-gray-200 p-1 dark:border-gray-700">
            <button
              type="button"
              onClick={() => setViewMode("role")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                viewMode === "role"
                  ? "bg-brand-500 text-white"
                  : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              }`}
            >
              By Role
            </button>
            <button
              type="button"
              onClick={() => setViewMode("ranking")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                viewMode === "ranking"
                  ? "bg-brand-500 text-white"
                  : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              }`}
            >
              Technician Ranking
            </button>
          </div>
        </div>
      </div>

      {isLoading && <div className="mt-3 text-xs italic text-gray-400 dark:text-gray-500">Loading...</div>}

      {!isLoading && viewMode === "role" && (
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <th className="px-3 py-2">{groupByLabel}</th>
                <th className="px-3 py-2 text-right">Planned</th>
                <th className="px-3 py-2 text-right">Completed</th>
                <th className="px-3 py-2 text-right">Due</th>
                <th className="px-3 py-2 text-right">Completion Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
              {roleSummaries.map((group) => {
                const isExpanded = expandedRoles.has(group.groupKey);
                return (
                  <Fragment key={group.groupKey}>
                    <tr
                      onClick={() => toggleRole(group.groupKey)}
                      className="cursor-pointer bg-gray-50/60 hover:bg-gray-100 dark:bg-white/[0.02] dark:hover:bg-white/[0.05]"
                    >
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`}>▸</span>
                          <span className="font-semibold text-gray-800 dark:text-white/90">{group.groupKey}</span>
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                            {group.members.length} org
                          </span>
                        </div>
                        <div className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                          <div className="h-full rounded-full bg-brand-500" style={{ width: `${group.rate}%` }} />
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-gray-800 dark:text-white/90">{group.planned}</td>
                      <td className="px-3 py-3 text-right font-semibold text-green-600 dark:text-green-400">{group.completed}</td>
                      <td className="px-3 py-3 text-right font-semibold text-yellow-600 dark:text-yellow-400">{group.due}</td>
                      <td className={`px-3 py-3 text-right font-semibold ${rateColor(group.rate)}`}>{group.rate}%</td>
                    </tr>

                    {isExpanded && (
                      <tr>
                        <td colSpan={5} className="bg-white p-0 dark:bg-gray-900">
                          <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                            <thead>
                              <tr className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                                <th className="px-3 py-2 pl-10">Initials</th>
                                <th className="px-3 py-2">Name</th>
                                {groupBy !== "detail_technician_role" && (
                                  <th className="px-3 py-2">Detail Role</th>
                                )}
                                <th className="px-3 py-2 text-right">Planned</th>
                                <th className="px-3 py-2 text-right">Completed</th>
                                <th className="px-3 py-2 text-right">Due</th>
                                <th className="px-3 py-2 text-right">Completion Rate</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 dark:divide-white/[0.03]">
                              {group.members.map((member) => (
                                <tr
                                  key={member.technicianName}
                                  onClick={() => setSelectedTechnician(member.technicianName)}
                                  className="cursor-pointer hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                                >
                                  <td className="px-3 py-2 pl-10 font-mono text-xs font-semibold text-brand-600 dark:text-brand-400">
                                    {getInitials(member.technicianName)}
                                  </td>
                                  <td className="px-3 py-2 font-medium text-gray-700 dark:text-gray-300">
                                    {member.technicianName}
                                  </td>
                                  {groupBy !== "detail_technician_role" && (
                                    <td className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">{member.detailRole}</td>
                                  )}
                                  <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{member.planned}</td>
                                  <td className="px-3 py-2 text-right text-green-600 dark:text-green-400">{member.completed}</td>
                                  <td className="px-3 py-2 text-right text-yellow-600 dark:text-yellow-400">{member.due}</td>
                                  <td className={`px-3 py-2 text-right ${rateColor(member.rate)}`}>{member.rate}%</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 bg-gray-50 font-semibold dark:border-gray-700 dark:bg-gray-800/40">
                <td className="px-3 py-3 text-gray-800 dark:text-white">
                  Total Preventive Maintenance assigned
                  <p className="mt-0.5 text-xs font-normal text-gray-400">
                    {grandTotal.groupCount} {groupByLabel.toLowerCase()} groups · {grandTotal.technicianCount} technicians
                  </p>
                </td>
                <td className="px-3 py-3 text-right text-gray-800 dark:text-white">{grandTotal.planned}</td>
                <td className="px-3 py-3 text-right text-green-600 dark:text-green-400">{grandTotal.completed}</td>
                <td className="px-3 py-3 text-right text-yellow-600 dark:text-yellow-400">{grandTotal.due}</td>
                <td className={`px-3 py-3 text-right ${rateColor(grandTotal.rate)}`}>{grandTotal.rate}%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {!isLoading && viewMode === "ranking" && (
        <div className="mt-5 space-y-3">
          {ranking.map((tech, idx) => {
            const rank = idx + 1;
            const barWidth = maxHours === 0 ? 0 : Math.round((tech.hours / maxHours) * 100);
            return (
              <div
                key={tech.technicianName}
                onClick={() => setSelectedTechnician(tech.technicianName)}
                className="flex cursor-pointer items-center gap-4 rounded-lg p-2 -m-2 hover:bg-gray-50 dark:hover:bg-white/[0.03]"
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${rankBadgeStyle(rank)}`}
                >
                  {rank}
                </span>
                <div className="w-48 shrink-0">
                  <p className="text-sm font-semibold text-gray-800 dark:text-white/90">{getInitials(tech.technicianName)}</p>
                  <p className="truncate text-xs font-medium text-gray-700 dark:text-gray-300">{tech.technicianName}</p>
                  <p className="truncate text-[11px] text-gray-300 dark:text-gray-600">{tech.detailRole}</p>
                </div>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${barWidth}%` }} />
                </div>
                <div className="w-32 shrink-0 text-right">
                  <p className="text-sm font-semibold text-gray-800 dark:text-white/90">{tech.hours.toFixed(2)} hrs</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    {tech.days} days · {tech.planned} PM
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        isOpen={!!selectedTechnician}
        onClose={() => setSelectedTechnician(null)}
        className="max-w-[720px] overflow-hidden rounded-2xl p-0"
        showCloseButton
      >
        {selectedTechnician && (
          <div className="max-h-[85vh] overflow-y-auto p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Technician Detail: {selectedTechnician}
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Year {selectedYear}</p>

            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-blue-50 p-4 text-center dark:bg-blue-500/10">
                <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">{selectedTechnicianStat.planned}</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Total PM</p>
              </div>
              <div className="rounded-xl bg-green-50 p-4 text-center dark:bg-green-500/10">
                <p className="text-2xl font-bold text-green-700 dark:text-green-400">{selectedTechnicianStat.days.size}</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Working Days</p>
              </div>
              <div className="rounded-xl bg-yellow-50 p-4 text-center dark:bg-yellow-500/10">
                <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">
                  {selectedTechnicianStat.hours.toFixed(2)}
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Total Hours</p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {selectedTechnicianOrders.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-400 dark:text-gray-500">
                  No preventive maintenance found for this technician in {selectedYear}.
                </p>
              ) : (
                selectedTechnicianOrders.map((order) => {
                  const hours =
                    order.start_clock && order.end_clock
                      ? clockDiffHours(order.start_clock, order.end_clock)
                      : null;
                  return (
                    <button
                      key={order.id}
                      type="button"
                      onClick={() => {
                        setSelectedTechnician(null);
                        const params = new URLSearchParams();
                        params.set("machine_no", String(order.machine_no));
                        params.set("technician", selectedTechnician);
                        const date = toLocalDateValue(order.execution_date || order.preventive_date);
                        if (date) {
                          params.set("start_at", date);
                          params.set("end_at", date);
                        }
                        navigate(`/history-logs?${params.toString()}`);
                      }}
                      className="flex w-full items-start justify-between gap-3 rounded-xl border border-gray-200 p-4 text-left transition hover:border-brand-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-white/[0.03]"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-brand-600 dark:text-brand-400">
                            {order.machine_asset}
                          </span>
                          <Badge size="sm" color={statusBadgeColor(order.status)}>{order.status}</Badge>
                        </div>
                        <p className="mt-1 font-medium text-gray-800 dark:text-white/90">{order.machine_name}</p>
                        <p className="truncate text-xs text-gray-400 dark:text-gray-500">
                          {order.location ?? order.department ?? "-"}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                          {hours !== null ? `${hours.toFixed(2)} hrs` : "-"}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          {formatDateOnly(order.execution_date || order.preventive_date)}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
