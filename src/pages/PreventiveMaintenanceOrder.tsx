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
import {
  fetchApprovedOrders,
  fetchMachineParameters,
  fetchOrderResults,
  saveOrderResults,
  updateApprovedOrder,
  fetchTechnicians,
  type MachineParameterRecord,
  type TechnicianRecord,
  type ApprovedOrderRecord,
} from "../services/pmoApi";

type ChecklistRow = {
  parameterId: number;
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
type OrderSortColumn =
  | "asset"
  | "name"
  | "location"
  | "department"
  | "sub"
  | "type"
  | "week"
  | "date"
  | "technician"
  | "status";
type OrderSortDirection = "asc" | "desc";

type ApprovalStage = {
  approved: boolean;
  approvedBy: string;
  approvedAt: string; // ISO timestamp
};

type Approvals = {
  technician: ApprovalStage;
  user: ApprovalStage; // Machine User / PIC
  engineering: ApprovalStage;
};

const emptyApprovalStage = (): ApprovalStage => ({ approved: false, approvedBy: "", approvedAt: "" });
const emptyApprovals = (): Approvals => ({
  technician: emptyApprovalStage(),
  user: emptyApprovalStage(),
  engineering: emptyApprovalStage(),
});

const approvalStageMeta: { key: keyof Approvals; label: string; description: string }[] = [
  { key: "technician", label: "Technician", description: "Confirms the checklist was carried out as recorded." },
  { key: "user", label: "Machine User / PIC", description: "Confirms the results on behalf of the machine's user/PIC." },
  { key: "engineering", label: "Engineering", description: "Final sign-off. Locks the record from further edits." },
];

export default function PreventiveMaintenanceOrder() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<MaintenanceOrder | null>(null);
  const [technicians, setTechnicians] = useState<string[]>([""]);
  const [technicianRoster, setTechnicianRoster] = useState<TechnicianRecord[]>([]);
  const [technicianSubFilter, setTechnicianSubFilter] = useState<string>("All");
  const [pendingApprovalStage, setPendingApprovalStage] = useState<keyof Approvals | null>(null);
  const [approverNameDraft, setApproverNameDraft] = useState("");
  // Reflects the backend record's engineering sign-off, not the in-progress draft —
  // so confirming Engineering approval doesn't lock the form before Save can persist it.
  const [isRecordLocked, setIsRecordLocked] = useState(false);
  const today = new Date();
  const [selectedYear, setSelectedYear] = useState<number | "All">(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number | "All">(today.getMonth());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  // Hides "Completed" orders from the table by default - the list is meant for orders
  // that still need attention, not a historical log. Independent of the Status dropdown
  // above, so switching Status back to "All" doesn't silently bring Completed back.
  const [hideCompleted, setHideCompleted] = useState(true);
  const [subFilter, setSubFilter] = useState<string>("All");
  const [departmentFilter, setDepartmentFilter] = useState<string>("All");
  const [typeFilter, setTypeFilter] = useState<string>("All");
  const [weekFilter, setWeekFilter] = useState<number | "All">("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [orderSortColumn, setOrderSortColumn] = useState<OrderSortColumn>("asset");
  const [orderSortDirection, setOrderSortDirection] = useState<OrderSortDirection>("asc");
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    machineId: "",
    machineAssetNumber: "",
    machineName: "",
    preventiveDate: "",
    preventiveTimeStart: "",
    preventiveTimeEnd: "",
    department: "",
    checklist: { mechanical: [], electrical: [], utilities: [] } as ChecklistSection,
    approvals: emptyApprovals(),
  });

  const [maintenanceOrders, setMaintenanceOrders] = useState<MaintenanceOrder[]>([]);
  const [approvedOrdersById, setApprovedOrdersById] = useState<Map<string, ApprovedOrderRecord>>(new Map());
  const [machineParameters, setMachineParameters] = useState<MachineParameterRecord[]>([]);

  useEffect(() => {
    const loadApprovedOrders = async () => {
      try {
        const rows = await fetchApprovedOrders();
        const mappedOrders: MaintenanceOrder[] = rows.map((row) => ({
          id: String(row.id),
          machineId: row.machine_asset || String(row.machine_no),
          machineAsset: row.machine_asset,
          machineNo: row.machine_no,
          machineName: row.machine_name,
          location: row.location,
          department: row.department || "Unassigned",
          sub: row.sub,
          preventiveDate: row.preventive_date || "",
          status: row.status,
          technician: row.technician_name || "Planner",
          year: row.year,
          month: row.month,
          week: row.week,
          machineType: row.preventive_types,
        }));

        setMaintenanceOrders(mappedOrders);
        setApprovedOrdersById(new Map(rows.map((row) => [String(row.id), row])));
      } catch (error) {
        console.error("Failed to load approved orders from backend:", error);
        setMaintenanceOrders([]);
        setApprovedOrdersById(new Map());
      }
    };

    void loadApprovedOrders();

    const loadMachineParameters = async () => {
      try {
        const parameters = await fetchMachineParameters();
        setMachineParameters(parameters);
      } catch (error) {
        console.error("Failed to load machine parameters:", error);
      }
    };

    void loadMachineParameters();

    const loadTechnicians = async () => {
      try {
        const roster = await fetchTechnicians();
        setTechnicianRoster(roster);
      } catch (error) {
        console.error("Failed to load technicians list:", error);
      }
    };

    void loadTechnicians();
  }, []);

  const departmentOptions = useMemo(
    () => Array.from(new Set(maintenanceOrders.map((order) => order.department).filter(Boolean))).sort(),
    [maintenanceOrders],
  );

  // Year filter reflects whatever years actually exist in the approved orders, not a fixed range
  const yearOptions = useMemo(() => {
    const years = new Set(maintenanceOrders.map((order) => order.year).filter(Boolean));
    years.add(new Date().getFullYear());
    return Array.from(years).sort((a, b) => a - b);
  }, [maintenanceOrders]);

  const typeOptions = useMemo(
    () =>
      Array.from(
        new Set(
          maintenanceOrders.flatMap((order) =>
            String(order.machineType || "").split(",").map((type) => type.trim()).filter(Boolean),
          ),
        ),
      ).sort(),
    [maintenanceOrders],
  );

  // Sub options for the technician picker are derived from the technicians table itself
  // (BLD, UTY, MTC, SPT, ADM, ...), matching the same sub categories used elsewhere.
  const technicianSubOptions = useMemo(
    () => Array.from(new Set(technicianRoster.map((tech) => tech.technician_main_sub).filter(Boolean))).sort(),
    [technicianRoster],
  );

  const filteredTechnicianRoster = useMemo(
    () =>
      technicianSubFilter === "All"
        ? technicianRoster
        : technicianRoster.filter((tech) => tech.technician_main_sub === technicianSubFilter),
    [technicianRoster, technicianSubFilter],
  );

  const handleOrderSort = (column: OrderSortColumn) => {
    if (orderSortColumn === column) {
      setOrderSortDirection(orderSortDirection === "asc" ? "desc" : "asc");
    } else {
      setOrderSortColumn(column);
      setOrderSortDirection("asc");
    }
  };

  const filteredOrders = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = maintenanceOrders.filter((order) => {
      const matchesYear = selectedYear === "All" || order.year === selectedYear;
      const matchesMonth = selectedMonth === "All" || order.month === selectedMonth;
      const matchesStatus = statusFilter === "All" || order.status === statusFilter;
      const matchesHideCompleted = !hideCompleted || order.status !== "Completed";
      const matchesSub = subFilter === "All" || order.sub === subFilter;
      const matchesDepartment = departmentFilter === "All" || order.department === departmentFilter;
      const matchesType =
        typeFilter === "All" ||
        String(order.machineType || "").split(",").map((type) => type.trim()).includes(typeFilter);
      const matchesWeek = weekFilter === "All" || order.week === weekFilter;
      const matchesSearch =
        !query ||
        order.machineName.toLowerCase().includes(query) ||
        order.machineId.toLowerCase().includes(query) ||
        order.department.toLowerCase().includes(query) ||
        order.id.toLowerCase().includes(query) ||
        order.sub.toLowerCase().includes(query);

      return matchesYear && matchesMonth && matchesStatus && matchesHideCompleted && matchesSub && matchesDepartment && matchesType && matchesWeek && matchesSearch;
    });

    return [...filtered].sort((a, b) => {
      let aVal: string | number = "";
      let bVal: string | number = "";
      switch (orderSortColumn) {
        case "asset": aVal = a.machineAsset || a.machineId; bVal = b.machineAsset || b.machineId; break;
        case "name": aVal = a.machineName; bVal = b.machineName; break;
        case "location": aVal = a.location || ""; bVal = b.location || ""; break;
        case "department": aVal = a.department; bVal = b.department; break;
        case "sub": aVal = a.sub; bVal = b.sub; break;
        case "type": aVal = a.machineType || ""; bVal = b.machineType || ""; break;
        case "week": aVal = a.week ?? 0; bVal = b.week ?? 0; break;
        case "date": aVal = a.preventiveDate || ""; bVal = b.preventiveDate || ""; break;
        case "technician": aVal = a.technician; bVal = b.technician; break;
        case "status": aVal = a.status; bVal = b.status; break;
      }
      const comparison =
        typeof aVal === "number" && typeof bVal === "number"
          ? aVal - bVal
          : String(aVal).localeCompare(String(bVal));
      return orderSortDirection === "asc" ? comparison : -comparison;
    });
  }, [maintenanceOrders, searchQuery, selectedMonth, selectedYear, statusFilter, hideCompleted, subFilter, departmentFilter, typeFilter, weekFilter, orderSortColumn, orderSortDirection]);

  const openForm = async (order: MaintenanceOrder) => {
    setSelectedOrder(order);
    const orderId = Number(order.id);

    const checklist: ChecklistSection = { mechanical: [], electrical: [], utilities: [] };

    try {
      // Seeds result rows from the machine template if missing, then returns them
      const results = await fetchOrderResults(orderId);
      for (const row of results) {
        const checklistRow: ChecklistRow = {
          parameterId: row.parameter_id,
          item: row.part_checklist || "",
          action: row.action || "",
          standard: row.standard || "",
          result: row.result || "",
          justification: row.justification || "NA",
        };
        const partMaster = String(row.part_master || "").toLowerCase();
        if (partMaster.includes("electric") || partMaster.includes("wind") || partMaster.includes("listrik") || partMaster.includes("angin")) {
          checklist.electrical.push(checklistRow);
        } else if (partMaster.includes("mechanic") || partMaster.includes("mekanik")) {
          checklist.mechanical.push(checklistRow);
        } else {
          checklist.utilities.push(checklistRow);
        }
      }
    } catch (error) {
      console.error("Failed to load order results, falling back to machine template:", error);
      const machineNo = order.machineNo ?? 0;
      const parameters = machineParameters
        .filter((parameter) => parameter.machine_no === machineNo)
        .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);

      for (const parameter of parameters) {
        const checklistRow: ChecklistRow = {
          parameterId: parameter.id,
          item: parameter.part_checklist,
          action: parameter.action || "",
          standard: parameter.standard || "",
          result: "",
          justification: "NA",
        };
        const partMaster = parameter.part_master.toLowerCase();
        if (partMaster.includes("electric") || partMaster.includes("wind") || partMaster.includes("listrik") || partMaster.includes("angin")) {
          checklist.electrical.push(checklistRow);
        } else if (partMaster.includes("mechanic") || partMaster.includes("mekanik")) {
          checklist.mechanical.push(checklistRow);
        } else {
          checklist.utilities.push(checklistRow);
        }
      }
    }

    // Rehydrate real approval state from the backend record so a re-opened,
    // already-approved order shows correctly (and stays locked if Engineering signed off).
    const rawRecord = approvedOrdersById.get(order.id);
    const approvals: Approvals = {
      technician: {
        approved: Boolean(rawRecord?.approved_by_technician_date),
        approvedBy: rawRecord?.approved_by_technician_user || "",
        approvedAt: rawRecord?.approved_by_technician_date || "",
      },
      user: {
        approved: Boolean(rawRecord?.approved_by_pic_date),
        approvedBy: rawRecord?.approved_by_pic_user || "",
        approvedAt: rawRecord?.approved_by_pic_date || "",
      },
      engineering: {
        approved: Boolean(rawRecord?.approved_by_engineering_date),
        approvedBy: rawRecord?.approved_by_engineering_user || "",
        approvedAt: rawRecord?.approved_by_engineering_date || "",
      },
    };

    setFormData({
      machineId: order.id,
      machineAssetNumber: order.machineAsset || "",
      machineName: order.machineName,
      preventiveDate: order.preventiveDate,
      preventiveTimeStart: "08:00",
      preventiveTimeEnd: "11:00",
      department: order.department,
      checklist,
      approvals,
    });
    setTechnicians([order.technician]);
    setTechnicianSubFilter(order.sub || "All");
    setPendingApprovalStage(null);
    setApproverNameDraft("");
    setIsRecordLocked(Boolean(rawRecord?.approved_by_engineering_date));
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

  // Engineering is the final stage — once approved AND SAVED, nobody can edit the record anymore.
  // This intentionally reads from isRecordLocked (persisted backend state) rather than
  // formData.approvals.engineering.approved (the unsaved draft), otherwise clicking "Confirm"
  // on the Engineering approval locks the form before Save Record can ever run.
  const isLocked = isRecordLocked;

  const approvalOrder: (keyof Approvals)[] = ["technician", "user", "engineering"];

  const canApprove = (stage: keyof Approvals) => {
    if (isLocked) return false;
    const stageIndex = approvalOrder.indexOf(stage);
    if (formData.approvals[stage].approved) return false;
    // Each stage requires every prior stage to already be approved (sequential sign-off).
    return approvalOrder.slice(0, stageIndex).every((prior) => formData.approvals[prior].approved);
  };

  const startApproval = (stage: keyof Approvals) => {
    if (!canApprove(stage)) return;
    setPendingApprovalStage(stage);
    setApproverNameDraft(stage === "technician" ? technicians.map((t) => t.trim()).filter(Boolean).join(", ") : "");
  };

  const cancelApproval = () => {
    setPendingApprovalStage(null);
    setApproverNameDraft("");
  };

  const confirmApproval = () => {
    if (!pendingApprovalStage) return;
    const name = approverNameDraft.trim();
    if (!name) return;
    const stage = pendingApprovalStage;
    setFormData((prev) => ({
      ...prev,
      approvals: {
        ...prev.approvals,
        [stage]: {
          approved: true,
          approvedBy: name,
          approvedAt: new Date().toISOString(),
        },
      },
    }));
    setPendingApprovalStage(null);
    setApproverNameDraft("");
  };

  const handleSaveRecord = async () => {
    if (!selectedOrder) return;
    if (isLocked) return; // Engineering has signed off — record is frozen.
    const orderId = Number(selectedOrder.id);
    if (Number.isNaN(orderId)) {
      closeForm();
      return;
    }

    const techniciansText = technicians.map((name) => name.trim()).filter(Boolean).join(", ");
    const nextStatus: StatusFilter = formData.approvals.engineering.approved
      ? "Completed"
      : "Approval";
    setIsSaving(true);
    try {
      const resultItems = (Object.values(formData.checklist) as ChecklistRow[][])
        .flat()
        .map((row) => ({
          parameter_id: row.parameterId,
          result: row.result.trim() || null,
          justification: row.justification.trim() || "NA",
        }));

      await updateApprovedOrder(orderId, {
        machine_asset: formData.machineAssetNumber,
        preventive_date: formData.preventiveDate || null,
        start_clock: formData.preventiveTimeStart ? `${formData.preventiveTimeStart}:00` : null,
        end_clock: formData.preventiveTimeEnd ? `${formData.preventiveTimeEnd}:00` : null,
        technician_name: techniciansText || null,
        status: nextStatus,
        approved_by_technician_date: formData.approvals.technician.approvedAt || null,
        approved_by_technician_user: formData.approvals.technician.approvedBy || null,
        approved_by_pic_date: formData.approvals.user.approvedAt || null,
        approved_by_pic_user: formData.approvals.user.approvedBy || null,
        approved_by_engineering_date: formData.approvals.engineering.approvedAt || null,
        approved_by_engineering_user: formData.approvals.engineering.approvedBy || null,
      });

      await saveOrderResults(orderId, resultItems);

      setMaintenanceOrders((prev) =>
        prev.map((order) =>
          order.id === selectedOrder.id
            ? {
                ...order,
                machineAsset: formData.machineAssetNumber || order.machineAsset,
                preventiveDate: formData.preventiveDate,
                technician: techniciansText || order.technician,
                status: nextStatus,
              }
            : order,
        ),
      );

      setApprovedOrdersById((prev) => {
        const next = new Map(prev);
        const existing = next.get(selectedOrder.id);
        if (existing) {
          next.set(selectedOrder.id, {
            ...existing,
            machine_asset: formData.machineAssetNumber || existing.machine_asset,
            preventive_date: formData.preventiveDate || null,
            technician_name: techniciansText || existing.technician_name,
            status: nextStatus,
            approved_by_technician_date: formData.approvals.technician.approvedAt || null,
            approved_by_technician_user: formData.approvals.technician.approvedBy || null,
            approved_by_pic_date: formData.approvals.user.approvedAt || null,
            approved_by_pic_user: formData.approvals.user.approvedBy || null,
            approved_by_engineering_date: formData.approvals.engineering.approvedAt || null,
            approved_by_engineering_user: formData.approvals.engineering.approvedBy || null,
          });
        }
        return next;
      });

      if (formData.approvals.engineering.approved) {
        setIsRecordLocked(true);
      }

      closeForm();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to save preventive order.");
    } finally {
      setIsSaving(false);
    }
  };

  const renderOrderHeader = (column: OrderSortColumn, label: string) => (
    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
      <button onClick={() => handleOrderSort(column)} className="flex cursor-pointer items-center gap-2 uppercase hover:text-brand-600">
        <span>{label}</span>
        <span className="ml-1 text-xs">{orderSortColumn === column && (orderSortDirection === "asc" ? "↑" : "↓")}</span>
      </button>
    </TableCell>
  );

  return (
    <>
      <PageMeta
        title="Preventive Maintenance Orders"
        description="List of preventive maintenance records and machine inspection forms"
      />
      <PageBreadcrumb pageTitle="Preventive Maintenance Orders" />

      <div className="space-y-6">
        <ComponentCard title="Preventive Schedule Filters">
          <div className="grid gap-4 md:grid-cols-4">
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
                {yearOptions.map((year) => (
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
              <span className="mb-2 block">Sub</span>
              <select
                value={subFilter}
                onChange={(e) => setSubFilter(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              >
                <option value="All">All Subs</option>
                <option value="MTC">MTC</option>
                <option value="UTY">UTY</option>
                <option value="BLD">BLD</option>
              </select>
            </label>

            <label className="text-sm text-gray-700 dark:text-gray-300">
              <span className="mb-2 block">Department</span>
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              >
                <option value="All">All Departments</option>
                {departmentOptions.map((department) => (
                  <option key={department} value={department}>
                    {department}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm text-gray-700 dark:text-gray-300">
              <span className="mb-2 block">Preventive Type</span>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              >
                <option value="All">All Types</option>
                {typeOptions.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm text-gray-700 dark:text-gray-300">
              <span className="mb-2 block">Week</span>
              <select
                value={weekFilter}
                onChange={(e) => setWeekFilter(e.target.value === "All" ? "All" : Number(e.target.value))}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              >
                <option value="All">All Weeks</option>
                {[1, 2, 3, 4, 5].map((week) => (
                  <option key={week} value={week}>
                    Week {week}
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

            <label className="flex items-end gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={hideCompleted}
                onChange={(e) => setHideCompleted(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800"
              />
              <span className="pb-0.5">Hide Completed</span>
            </label>

            <label className="text-sm text-gray-700 dark:text-gray-300">
              <span className="mb-2 block">Search Machine / ID</span>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search machine or ID"
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
                    {renderOrderHeader("asset", "Machine Asset (ID)")}
                    {renderOrderHeader("name", "Machine Name")}
                    {renderOrderHeader("location", "Location")}
                    {renderOrderHeader("department", "Department")}
                    {renderOrderHeader("sub", "Sub")}
                    {renderOrderHeader("type", "Type")}
                    {renderOrderHeader("week", "Week")}
                    {renderOrderHeader("date", "Preventive Date")}
                    {renderOrderHeader("technician", "Technician")}
                    {renderOrderHeader("status", "Status")}
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
                        {order.preventiveDate || "-"}
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
                          onClick={() => void openForm(order)}
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
            {isLocked && (
              <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400">
                <span className="font-semibold">Locked:</span>
                <span>
                  Approved by Engineering ({formData.approvals.engineering.approvedBy}) on{" "}
                  {new Date(formData.approvals.engineering.approvedAt).toLocaleString()}. This record can no longer be edited.
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <label className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                <span>Machine ID</span>
                <input
                  value={formData.machineId}
                  disabled={isLocked}
                  onChange={(e) => setFormData((prev) => ({ ...prev, machineId: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none ring-0 focus:border-brand-500 disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:disabled:bg-gray-800/60"
                />
              </label>

              <label className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                <span>Machine Asset Number</span>
                <input
                  value={formData.machineAssetNumber}
                  disabled={isLocked}
                  onChange={(e) => setFormData((prev) => ({ ...prev, machineAssetNumber: e.target.value }))}
                  placeholder="e.g. AST-00123"
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none ring-0 focus:border-brand-500 disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:disabled:bg-gray-800/60"
                />
              </label>

              <label className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                <span>Machine Name</span>
                <input
                  value={formData.machineName}
                  disabled={isLocked}
                  onChange={(e) => setFormData((prev) => ({ ...prev, machineName: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none ring-0 focus:border-brand-500 disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:disabled:bg-gray-800/60"
                />
              </label>

              <label className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                <span>Preventive Date</span>
                <input
                  type="date"
                  value={formData.preventiveDate}
                  disabled={isLocked}
                  onChange={(e) => setFormData((prev) => ({ ...prev, preventiveDate: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none ring-0 focus:border-brand-500 disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:disabled:bg-gray-800/60"
                />
              </label>

              <label className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                <span>Time Start</span>
                <input
                  type="time"
                  value={formData.preventiveTimeStart}
                  disabled={isLocked}
                  onChange={(e) => setFormData((prev) => ({ ...prev, preventiveTimeStart: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none ring-0 focus:border-brand-500 disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:disabled:bg-gray-800/60"
                />
              </label>

              <label className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                <span>Time End</span>
                <input
                  type="time"
                  value={formData.preventiveTimeEnd}
                  disabled={isLocked}
                  onChange={(e) => setFormData((prev) => ({ ...prev, preventiveTimeEnd: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none ring-0 focus:border-brand-500 disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:disabled:bg-gray-800/60"
                />
              </label>

              <label className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                <span>Department</span>
                <input
                  value={formData.department}
                  disabled={isLocked}
                  onChange={(e) => setFormData((prev) => ({ ...prev, department: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none ring-0 focus:border-brand-500 disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:disabled:bg-gray-800/60"
                />
              </label>
            </div>

            <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Technician Names</h3>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                    <span>Filter by Sub</span>
                    <select
                      value={technicianSubFilter}
                      onChange={(e) => setTechnicianSubFilter(e.target.value)}
                      disabled={isLocked}
                      className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none focus:border-brand-500 disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    >
                      <option value="All">All</option>
                      {technicianSubOptions.map((sub) => (
                        <option key={sub} value={sub}>
                          {sub}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={addTechnician}
                    disabled={technicians.length >= 7 || isLocked}
                    className="rounded-md bg-brand-500 px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-300"
                  >
                    Add Technician
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {technicians.map((tech, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <select
                      value={tech}
                      onChange={(e) => updateTechnician(index, e.target.value)}
                      disabled={isLocked}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none ring-0 focus:border-brand-500 disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:disabled:bg-gray-800/60"
                    >
                      <option value="">{`Select Technician ${index + 1}`}</option>
                      {/* Keep a previously saved name selectable even if it falls outside the current sub filter */}
                      {tech && !filteredTechnicianRoster.some((t) => t.technician_name === tech) && (
                        <option value={tech}>{tech}</option>
                      )}
                      {filteredTechnicianRoster.map((t) => (
                        <option key={t.technician_name} value={t.technician_name}>
                          {t.technician_name} — {t.technician_main_sub}
                        </option>
                      ))}
                    </select>
                    {technicians.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeTechnician(index)}
                        disabled={isLocked}
                        className="rounded-lg border border-red-200 px-2 py-2 text-xs text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800 dark:text-red-400"
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
                      <table className="w-full table-fixed border-separate border-spacing-0 text-left">
                        <colgroup>
                          <col className="w-[22%]" />
                          <col className="w-[26%]" />
                          <col className="w-[18%]" />
                          <col className="w-[17%]" />
                          <col className="w-[17%]" />
                        </colgroup>
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
                              {/* Checklist, Action, and Standard come from the machine template — shown as
                                  wrapped, full-sentence text instead of a single-line input that clips them. */}
                              <td className="border border-gray-200 px-3 py-2 align-top text-sm text-gray-700 dark:border-gray-700 dark:text-gray-300">
                                <p className="whitespace-normal break-words">{row.item}</p>
                              </td>
                              <td className="border border-gray-200 px-3 py-2 align-top text-sm text-gray-700 dark:border-gray-700 dark:text-gray-300">
                                <p className="whitespace-normal break-words">{row.action}</p>
                              </td>
                              <td className="border border-gray-200 px-3 py-2 align-top text-sm text-gray-700 dark:border-gray-700 dark:text-gray-300">
                                <p className="whitespace-normal break-words">{row.standard}</p>
                              </td>
                              <td className="border border-gray-200 px-3 py-2 align-top dark:border-gray-700">
                                <textarea
                                  value={row.result}
                                  disabled={isLocked}
                                  rows={2}
                                  onChange={(e) =>
                                    updateChecklistValue(
                                      sectionKey as keyof ChecklistSection,
                                      rowIndex,
                                      "result",
                                      e.target.value,
                                    )
                                  }
                                  className="w-full resize-y whitespace-normal break-words rounded-md border border-gray-300 bg-white px-2 py-2 text-sm outline-none focus:border-brand-500 disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:disabled:bg-gray-800/60"
                                />
                              </td>
                              <td className="border border-gray-200 px-3 py-2 align-top dark:border-gray-700">
                                <textarea
                                  value={row.justification}
                                  disabled={isLocked}
                                  rows={2}
                                  onChange={(e) =>
                                    updateChecklistValue(
                                      sectionKey as keyof ChecklistSection,
                                      rowIndex,
                                      "justification",
                                      e.target.value,
                                    )
                                  }
                                  className="w-full resize-y whitespace-normal break-words rounded-md border border-gray-300 bg-white px-2 py-2 text-sm outline-none focus:border-brand-500 disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:disabled:bg-gray-800/60"
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
                {approvalStageMeta.map((stage) => {
                  const stageState = formData.approvals[stage.key];
                  const isPending = pendingApprovalStage === stage.key;
                  return (
                    <div
                      key={stage.key}
                      className="flex flex-col justify-between gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                    >
                      <div>
                        <p className="text-sm font-semibold text-gray-800 dark:text-white">{stage.label}</p>
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{stage.description}</p>
                      </div>

                      {stageState.approved ? (
                        <div className="rounded-md bg-green-50 px-3 py-2 text-xs text-green-700 dark:bg-green-900/20 dark:text-green-400">
                          <p className="font-medium">Approved by {stageState.approvedBy}</p>
                          <p className="mt-0.5">{new Date(stageState.approvedAt).toLocaleString()}</p>
                        </div>
                      ) : isPending ? (
                        <div className="space-y-2">
                          <input
                            autoFocus
                            value={approverNameDraft}
                            onChange={(e) => setApproverNameDraft(e.target.value)}
                            placeholder="Type your name to confirm"
                            className="w-full rounded-md border border-gray-300 bg-white px-2 py-2 text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                          />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={confirmApproval} disabled={!approverNameDraft.trim()}>
                              Confirm
                            </Button>
                            <Button size="sm" variant="outline" onClick={cancelApproval}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => startApproval(stage.key)}
                          disabled={!canApprove(stage.key)}
                        >
                          Approve
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
            <Button variant="outline" onClick={closeForm}>
              Close
            </Button>
            <Button onClick={() => void handleSaveRecord()} disabled={isSaving || isLocked}>
              {isLocked ? "Locked" : isSaving ? "Saving..." : "Save Record"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}