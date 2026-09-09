import { useEffect, useMemo, useState } from "react";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import ComponentCard from "../components/common/ComponentCard";
import PageMeta from "../components/common/PageMeta";
import YearlyScheduleMatrixSection from "./YearlyScheduleMatrixSection";
import { type MachineSub, type PlannedPreventive, writeScheduledPlans } from "../data/preventiveMaintenanceData";
import { fetchPreventiveTypes, fetchSchedules, type ScheduleRecord } from "../services/pmoApi";

/**
 * Preventive Schedule Assignment > Calendar & Matrix View.
 *
 * Second of three sibling pages this used to be one page with (the other
 * two are Machines to Schedule and Scheduled Preventive Entries). Combines
 * two views that used to live in different places:
 *  - Calendar View: relocated from YearlyPreventiveSchedule.tsx, where it
 *    sat between the machines-to-schedule table and the entries table.
 *  - Yearly Schedule Matrix: relocated from its own standalone page
 *    (previously under Dashboard > Engineering Yearly Schedule, now removed
 *    from there since it only lives here). See YearlyScheduleMatrixSection.tsx
 *    for that content - it's the same component with its own PageMeta/
 *    PageBreadcrumb stripped out, since this page provides those instead.
 *
 * Fetches its own copy of schedules/preventive types for the Calendar View;
 * the Matrix section below fetches its own data independently, same as it
 * always has.
 */

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function PreventiveScheduleCalendarMatrix() {
  const [selectedSub, setSelectedSub] = useState<MachineSub>("UTY");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [plans, setPlans] = useState<PlannedPreventive[]>([]);
  const [preventiveTypes, setPreventiveTypes] = useState<
    Array<{ id: number; abbreviation: string; parameter: string }>
  >([]);

  useEffect(() => {
    const loadPlans = async () => {
      try {
        const remotePlans = await fetchSchedules();
        const mappedPlans: PlannedPreventive[] = remotePlans.map((plan: ScheduleRecord) => ({
          id: String(plan.id),
          sub: plan.sub,
          machineId: String(plan.machine_no),
          machineAsset: plan.machine_asset ? String(plan.machine_asset) : String(plan.machine_no),
          machineName: plan.machine_name || (plan.machine_no ? `Machine ${plan.machine_no}` : "Unknown"),
          department: plan.department || "Database",
          location: plan.location || null,
          year: plan.tahun,
          month: plan.bulan,
          week: plan.minggu,
          scheduledDate: plan.tanggal_jadwal || `${plan.tahun}-${String(plan.bulan + 1).padStart(2, "0")}-01`,
          preventiveTypes: String(plan.preventive_types).split(",").filter(Boolean),
          status: plan.status,
          approvedByEngineeringUser: plan.approved_by_engineering_user || null,
          approvedByEngineeringDate: plan.approved_by_engineering_date || null,
          approvedByManagerUser: plan.approved_by_manager_user || null,
          approvedByManagerDate: plan.approved_by_manager_date || null,
        }));

        setPlans(mappedPlans);
        writeScheduledPlans(mappedPlans);
      } catch (error) {
        console.error("Failed to load schedules from backend:", error);
      }
    };

    void loadPlans();
  }, []);

  useEffect(() => {
    const loadPreventiveTypes = async () => {
      try {
        const types = await fetchPreventiveTypes();
        setPreventiveTypes(types);
      } catch (error) {
        console.error("Failed to load preventive types from backend:", error);
      }
    };

    void loadPreventiveTypes();
  }, []);

  const typeLabelByCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const type of preventiveTypes) {
      map.set(type.abbreviation, type.parameter);
    }
    return map;
  }, [preventiveTypes]);

  const displayPlans = useMemo(
    () =>
      plans.map((plan) => ({
        ...plan,
        preventiveTypes: plan.preventiveTypes.map((type) => typeLabelByCode.get(type) ?? type),
      })),
    [plans, typeLabelByCode],
  );

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years = new Set(plans.map((plan) => plan.year).filter(Boolean));
    years.add(currentYear);
    years.add(selectedYear);
    return Array.from(years).sort((a, b) => a - b);
  }, [plans, selectedYear]);

  const scheduleForSelectedYear = useMemo(
    () => displayPlans.filter((plan) => plan.year === selectedYear && plan.sub === selectedSub),
    [displayPlans, selectedYear, selectedSub],
  );

  return (
    <>
      <PageMeta
        title="Calendar & Matrix View"
        description="Calendar view of scheduled preventive entries and the yearly schedule matrix"
      />
      <PageBreadcrumb pageTitle="Calendar & Matrix View" />

      <div className="space-y-6">
        <ComponentCard title={`Calendar View - ${selectedSub} / ${selectedYear}`}>
          <div className="mb-4 grid gap-4 md:grid-cols-4">
            <label className="text-sm text-gray-700 dark:text-gray-300">
              <span className="mb-2 block">Year</span>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm text-gray-700 dark:text-gray-300">
              <span className="mb-2 block">Group</span>
              <select
                value={selectedSub}
                onChange={(e) => setSelectedSub(e.target.value as MachineSub)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              >
                <option value="MTC">MTC</option>
                <option value="UTY">UTY</option>
                <option value="BLD">BLD</option>
              </select>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {monthNames.map((month, index) => {
              const monthPlans = scheduleForSelectedYear.filter((plan) => plan.month === index);

              return (
                <div
                  key={month}
                  className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-white/[0.02]"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="font-semibold text-gray-800 dark:text-white">{month}</h4>
                    <span className="rounded-full bg-brand-50 px-2 py-1 text-[10px] font-medium text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
                      {monthPlans.length} scheduled
                    </span>
                  </div>

                  <div className="overflow-y-auto rounded-lg bg-gray-50 p-2 dark:bg-gray-800/30" style={{ maxHeight: "280px" }}>
                    <div className="space-y-2">
                      {[1, 2, 3, 4, 5].map((week) => {
                        const weekPlans = monthPlans.filter((plan) => plan.week === week);
                        return (
                          <div
                            key={`${month}-week-${week}`}
                            className="rounded-lg border border-dashed border-gray-200 p-2 dark:border-gray-700"
                          >
                            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                              Week {week}
                            </div>
                            {weekPlans.length ? (
                              <div className="space-y-1">
                                {weekPlans.map((plan) => (
                                  <div key={plan.id} className="rounded bg-gray-100 px-2 py-1 text-[11px] text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                                    {plan.machineName} ({plan.preventiveTypes.join(" + ")})
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-[11px] text-gray-400">No planned task</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ComponentCard>

        <YearlyScheduleMatrixSection />
      </div>
    </>
  );
}
