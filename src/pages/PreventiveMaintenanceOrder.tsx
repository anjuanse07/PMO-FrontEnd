import { useEffect, useMemo, useState } from "react";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import ComponentCard from "../components/common/ComponentCard";
import PageMeta from "../components/common/PageMeta";
import Button from "../components/ui/button/Button";
import { Modal } from "../components/ui/modal";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import Badge from "../components/ui/badge/Badge";
import { type MaintenanceOrder } from "../data/preventiveMaintenanceData";
import { fetchApprovedOrders } from "../services/pmoApi";

type ChecklistRow = {
  item: string;
  action: string;
  standard: string;
  result: string;
  justification: string;
};

type ChecklistSection = {
  mechanical: ChecklistRow[];
  electrical: ChecklistRow[];
  utilities: ChecklistRow[];
};

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

type StatusFilter = "All" | "In Progress" | "Approval" | "Completed";

const defaultChecklist: ChecklistSection = {
  mechanical: [
    {
      item: "Bearing inspection",
      action: "Check for wear and noise",
      standard: "No abnormal sound or vibration",
      result: "Pass",
      justification: "Within acceptable tolerance",
    },
    {
      item: "Lubrication",
      action: "Inspect grease and oil level",
      standard: "Oil level within minimum range",
      result: "Pass",
      justification: "Lubrication verified",
    },
  ],
  electrical: [
    {
      item: "Motor insulation",
      action: "Measure insulation resistance",
      standard: "Above 1 MΩ",
      result: "Pass",
      justification: "Insulation within specification",
    },
    {
      item: "Control panel",
      action: "Inspect wiring and terminals",
      standard: "No loose connection detected",
      result: "Needs attention",
      justification: "Tightening required on one terminal",
    },
  ],
  utilities: [
    {
      item: "Water flow",
      action: "Check flow and pressure",
      standard: "Flow stable and no leak",
      result: "Pass",
      justification: "Flow within normal operating range",
    },
  ],
};

const emptyApproval = {
  technicianName: "",
  userName: "",
  engineeringSupervisorName: "",
  technicianDateTime: "",
  userDateTime: "",
  engineeringSupervisorDateTime: "",
};

export default function PreventiveMaintenanceOrder() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<MaintenanceOrder | null>(null);
  const [technicians, setTechnicians] = useState<string[]>(["John Smith"]);
  const [selectedYear, setSelectedYear] = useState<number | "All">("All");
  const [selectedMonth, setSelectedMonth] = useState<number | "All">("All");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [formData, setFormData] = useState({
    machineId: "",
    machineName: "",
    preventiveDate: "",
    preventiveTimeStart: "08:00",
    preventiveTimeEnd: "10:00",
    department: "",
    checklist: defaultChecklist,
    approvals: emptyApproval,
  });

  const [maintenanceOrders, setMaintenanceOrders] = useState<MaintenanceOrder[]>([]);

  useEffect(() => {
    const loadApprovedOrders = async () => {
      try {
        const rows = await fetchApprovedOrders();
        const mappedOrders: MaintenanceOrder[] = rows.map((row) => ({
          id: String(row.id),
          machineId: row.machine_asset || String(row.machine_no),
          machineAsset: row.machine_asset,
          machineName: row.machine_name,
          location: row.location,
          department: row.department || "Unassigned",
          sub: row.sub,
          preventiveDate: row.preventive_date || row.execution_date || "",
          status: row.status,
          technician: row.technician_name || "Planner",
          year: row.year,
          month: row.month,
          week: row.week,
          machineType: row.preventive_types,
        }));

        setMaintenanceOrders(mappedOrders);
      } catch (error) {
        console.error("Failed to load approved orders from backend:", error);
        setMaintenanceOrders([]);
      }
    };

    void loadApprovedOrders();
  }, []);

  const filteredOrders = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return maintenanceOrders.filter((order) => {
      const matchesYear = selectedYear === "All" || order.year === selectedYear;
      const matchesMonth = selectedMonth === "All" || order.month === selectedMonth;
      const matchesStatus = statusFilter === "All" || order.status === statusFilter;
      const matchesSearch =
        !query ||
        order.machineName.toLowerCase().includes(query) ||
        order.machineId.toLowerCase().includes(query) ||
        order.department.toLowerCase().includes(query) ||
        order.id.toLowerCase().includes(query) ||
        order.sub.toLowerCase().includes(query);

      return matchesYear && matchesMonth && matchesStatus && matchesSearch;
    });
  }, [maintenanceOrders, searchQuery, selectedMonth, selectedYear, statusFilter]);

  const openForm = (order: MaintenanceOrder) => {
    setSelectedOrder(order);
    setFormData({
      machineId: order.id,
      machineName: order.machineName,
      preventiveDate: order.preventiveDate,
      preventiveTimeStart: "08:00",
      preventiveTimeEnd: "11:00",
      department: order.department,
      checklist: defaultChecklist,
      approvals: {
        technicianName: order.technician,
        userName: "",
        engineeringSupervisorName: "",
        technicianDateTime: "2026-08-15T08:30",
        userDateTime: "",
        engineeringSupervisorDateTime: "",
      },
    });
    setTechnicians([order.technician]);
    setIsOpen(true);
  };

  const closeForm = () => {
    setIsOpen(false);
    setSelectedOrder(null);
  };

  const addTechnician = () => {
    if (technicians.length >= 7) return;
    setTechnicians((prev) => [...prev, ""]);
  };

  const removeTechnician = (index: number) => {
    setTechnicians((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  };

  const updateTechnician = (index: number, value: string) => {
    setTechnicians((prev) => prev.map((tech, i) => (i === index ? value : tech)));
  };

  const updateChecklistValue = (
    section: keyof ChecklistSection,
    rowIndex: number,
    field: keyof ChecklistRow,
    value: string,
  ) => {
    setFormData((prev) => ({
      ...prev,
      checklist: {
        ...prev.checklist,
        [section]: (prev.checklist[section] as ChecklistRow[]).map((row, index) =>
          index === rowIndex ? { ...row, [field]: value } : row,
        ),
      },
    }));
  };

  const updateApproval = (field: keyof typeof emptyApproval, value: string) => {
    setFormData((prev) => ({
      ...prev,
      approvals: {
        ...prev.approvals,
        [field]: value,
      },
    }));
  };

  return (
    <>
      <PageMeta
        title="Preventive Maintenance Orders"
        description="List of preventive maintenance records and machine inspection forms"
      />
      <PageBreadcrumb pageTitle="Preventive Maintenance Orders" />

      <div className="space-y-6">
        <ComponentCard title="Preventive Schedule Filters">
          <div className="grid gap-4 md:grid-cols-5">
            <label className="text-sm text-gray-700 dark:text-gray-300">
              <span className="mb-2 block">Year</span>
              <select
                value={selectedYear}
                onChange={(e) =>
                  setSelectedYear(e.target.value === "All" ? "All" : Number(e.target.value))
                }
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              >
                <option value="All">All Years</option>
                {[2025, 2026, 2027].map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm text-gray-700 dark:text-gray-300">
              <span className="mb-2 block">Month</span>
              <select
                value={selectedMonth}
                onChange={(e) =>
                  setSelectedMonth(e.target.value === "All" ? "All" : Number(e.target.value))
                }
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              >
                <option value="All">All Months</option>
                {monthNames.map((month, index) => (
                  <option key={month} value={index}>
                    {month}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm text-gray-700 dark:text-gray-300">
              <span className="mb-2 block">Status</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              >
                <option value="All">All Status</option>
                <option value="In Progress">In Progress</option>
                <option value="Approval">Approval</option>
                <option value="Completed">Completed</option>
              </select>
            </label>

            <label className="text-sm text-gray-700 dark:text-gray-300 md:col-span-2">
              <span className="mb-2 block">Search Machine / ID / Department</span>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search machine or department"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </label>
          </div>
        </ComponentCard>

        <ComponentCard
          title={
            selectedYear === "All" && selectedMonth === "All"
              ? "Preventive Orders - All Months / All Years"
              : `Preventive Orders - ${selectedMonth === "All" ? "All Months" : monthNames[selectedMonth]} ${selectedYear === "All" ? "" : selectedYear}`
          }
        >
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
            <div className="max-w-full overflow-x-auto">
              <Table>
                <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
                  <TableRow>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                      Machine Asset (ID)
                    </TableCell>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                      Machine Name
                    </TableCell>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                      Location
                    </TableCell>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                      Department
                    </TableCell>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                      Sub
                    </TableCell>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                      Type
                    </TableCell>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                      Week
                    </TableCell>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                      Preventive Date
                    </TableCell>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                      Technician
                    </TableCell>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                      Status
                    </TableCell>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                      Action
                    </TableCell>
                  </TableRow>
                </TableHeader>

                <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                  {filteredOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="px-5 py-4 text-start text-theme-sm text-gray-600 dark:text-gray-300">
                        {order.machineAsset || order.machineId}
                      </TableCell>
                      <TableCell className="px-5 py-4 text-start text-theme-sm text-gray-600 dark:text-gray-300">
                        {order.machineName}
                      </TableCell>
                      <TableCell className="px-5 py-4 text-start text-theme-sm text-gray-600 dark:text-gray-300">
                        {order.location || "-"}
                      </TableCell>
                      <TableCell className="px-5 py-4 text-start text-theme-sm text-gray-600 dark:text-gray-300">
                        {order.department}
                      </TableCell>
                      <TableCell className="px-5 py-4 text-start text-theme-sm text-gray-600 dark:text-gray-300">
                        {order.sub}
                      </TableCell>
                      <TableCell className="px-5 py-4 text-start text-theme-sm text-gray-600 dark:text-gray-300">
                        {order.machineType || "-"}
                      </TableCell>
                      <TableCell className="px-5 py-4 text-start text-theme-sm text-gray-600 dark:text-gray-300">
                        {order.week ? `Week ${order.week}` : "-"}
                      </TableCell>
                      <TableCell className="px-5 py-4 text-start text-theme-sm text-gray-600 dark:text-gray-300">
                        {order.preventiveDate}
                      </TableCell>
                      <TableCell className="px-5 py-4 text-start text-theme-sm text-gray-600 dark:text-gray-300">
                        {order.technician}
                      </TableCell>
                      <TableCell className="px-5 py-4 text-start">
                        <Badge
                          size="sm"
                          color={
                            order.status === "In Progress"
                              ? "warning"
                              : order.status === "Approval"
                                ? "primary"
                                : "success"
                          }
                        >
                          {order.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-5 py-4 text-start">
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => openForm(order)}
                          className="bg-brand-500 hover:bg-brand-600"
                        >
                          Open Form
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </ComponentCard>
      </div>

      <Modal isOpen={isOpen} onClose={closeForm} className="max-w-[1200px] overflow-hidden rounded-2xl p-0" showCloseButton>
        <div className="max-h-[90vh] overflow-y-auto bg-white p-6 dark:bg-gray-900">
          <div className="mb-6 border-b border-gray-200 pb-4 dark:border-gray-700">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
              Preventive Maintenance Form
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {selectedOrder ? selectedOrder.machineName : "Machine preventive checklist"}
            </p>
          </div>

          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <label className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                <span>Machine ID</span>
                <input
                  value={formData.machineId}
                  onChange={(e) => setFormData((prev) => ({ ...prev, machineId: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none ring-0 focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </label>

              <label className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                <span>Machine Name</span>
                <input
                  value={formData.machineName}
                  onChange={(e) => setFormData((prev) => ({ ...prev, machineName: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none ring-0 focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </label>

              <label className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                <span>Preventive Date</span>
                <input
                  type="date"
                  value={formData.preventiveDate}
                  onChange={(e) => setFormData((prev) => ({ ...prev, preventiveDate: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none ring-0 focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </label>

              <label className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                <span>Time Start</span>
                <input
                  type="time"
                  value={formData.preventiveTimeStart}
                  onChange={(e) => setFormData((prev) => ({ ...prev, preventiveTimeStart: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none ring-0 focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </label>

              <label className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                <span>Time End</span>
                <input
                  type="time"
                  value={formData.preventiveTimeEnd}
                  onChange={(e) => setFormData((prev) => ({ ...prev, preventiveTimeEnd: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none ring-0 focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </label>

              <label className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                <span>Department</span>
                <input
                  value={formData.department}
                  onChange={(e) => setFormData((prev) => ({ ...prev, department: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none ring-0 focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </label>
            </div>

            <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Technician Names</h3>
                <button
                  type="button"
                  onClick={addTechnician}
                  disabled={technicians.length >= 7}
                  className="rounded-md bg-brand-500 px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-300"
                >
                  Add Technician
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {technicians.map((tech, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      value={tech}
                      onChange={(e) => updateTechnician(index, e.target.value)}
                      placeholder={`Technician ${index + 1}`}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none ring-0 focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    />
                    {technicians.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeTechnician(index)}
                        className="rounded-lg border border-red-200 px-2 py-2 text-xs text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-5">
              {Object.entries(formData.checklist).map(([sectionKey, sectionRows]) => {
                const sectionTitle =
                  sectionKey === "mechanical"
                    ? "Mechanical Part"
                    : sectionKey === "electrical"
                      ? "Electrical Part"
                      : "Other Utilities Part";

                return (
                  <div key={sectionKey} className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
                    <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
                      {sectionTitle}
                    </h3>

                    <div className="overflow-x-auto">
                      <table className="min-w-full border-separate border-spacing-0 text-left">
                        <thead>
                          <tr className="bg-gray-50 dark:bg-gray-800/60">
                            <th className="border border-gray-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:border-gray-700 dark:text-gray-300">
                              Checklist
                            </th>
                            <th className="border border-gray-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:border-gray-700 dark:text-gray-300">
                              Action
                            </th>
                            <th className="border border-gray-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:border-gray-700 dark:text-gray-300">
                              Standard
                            </th>
                            <th className="border border-gray-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:border-gray-700 dark:text-gray-300">
                              Result
                            </th>
                            <th className="border border-gray-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:border-gray-700 dark:text-gray-300">
                              Justification
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {(sectionRows as ChecklistRow[]).map((row, rowIndex) => (
                            <tr key={`${sectionKey}-${rowIndex}`}>
                              <td className="border border-gray-200 px-3 py-2 align-top dark:border-gray-700">
                                <input
                                  value={row.item}
                                  onChange={(e) =>
                                    updateChecklistValue(
                                      sectionKey as keyof ChecklistSection,
                                      rowIndex,
                                      "item",
                                      e.target.value,
                                    )
                                  }
                                  className="w-full rounded-md border border-gray-300 bg-white px-2 py-2 text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                                />
                              </td>
                              <td className="border border-gray-200 px-3 py-2 align-top dark:border-gray-700">
                                <input
                                  value={row.action}
                                  onChange={(e) =>
                                    updateChecklistValue(
                                      sectionKey as keyof ChecklistSection,
                                      rowIndex,
                                      "action",
                                      e.target.value,
                                    )
                                  }
                                  className="w-full rounded-md border border-gray-300 bg-white px-2 py-2 text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                                />
                              </td>
                              <td className="border border-gray-200 px-3 py-2 align-top dark:border-gray-700">
                                <input
                                  value={row.standard}
                                  onChange={(e) =>
                                    updateChecklistValue(
                                      sectionKey as keyof ChecklistSection,
                                      rowIndex,
                                      "standard",
                                      e.target.value,
                                    )
                                  }
                                  className="w-full rounded-md border border-gray-300 bg-white px-2 py-2 text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                                />
                              </td>
                              <td className="border border-gray-200 px-3 py-2 align-top dark:border-gray-700">
                                <input
                                  value={row.result}
                                  onChange={(e) =>
                                    updateChecklistValue(
                                      sectionKey as keyof ChecklistSection,
                                      rowIndex,
                                      "result",
                                      e.target.value,
                                    )
                                  }
                                  className="w-full rounded-md border border-gray-300 bg-white px-2 py-2 text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                                />
                              </td>
                              <td className="border border-gray-200 px-3 py-2 align-top dark:border-gray-700">
                                <input
                                  value={row.justification}
                                  onChange={(e) =>
                                    updateChecklistValue(
                                      sectionKey as keyof ChecklistSection,
                                      rowIndex,
                                      "justification",
                                      e.target.value,
                                    )
                                  }
                                  className="w-full rounded-md border border-gray-300 bg-white px-2 py-2 text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
              <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
                Approval Flow
              </h3>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <label className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                  <span>Technician Name</span>
                  <input
                    value={formData.approvals.technicianName}
                    onChange={(e) => updateApproval("technicianName", e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                  <input
                    type="datetime-local"
                    value={formData.approvals.technicianDateTime}
                    onChange={(e) => updateApproval("technicianDateTime", e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </label>

                <label className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                  <span>User Name</span>
                  <input
                    value={formData.approvals.userName}
                    onChange={(e) => updateApproval("userName", e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                  <input
                    type="datetime-local"
                    value={formData.approvals.userDateTime}
                    onChange={(e) => updateApproval("userDateTime", e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </label>

                <label className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                  <span>Engineering Supervisor</span>
                  <input
                    value={formData.approvals.engineeringSupervisorName}
                    onChange={(e) => updateApproval("engineeringSupervisorName", e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                  <input
                    type="datetime-local"
                    value={formData.approvals.engineeringSupervisorDateTime}
                    onChange={(e) => updateApproval("engineeringSupervisorDateTime", e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
            <Button variant="outline" onClick={closeForm}>
              Close
            </Button>
            <Button onClick={closeForm}>Save Record</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}