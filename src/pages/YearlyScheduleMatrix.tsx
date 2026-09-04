import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import ComponentCard from "../components/common/ComponentCard";
import PageMeta from "../components/common/PageMeta";
import YearlyProgressDashboard from "../components/ecommerce/YearlyProgressDashboard";
import { type MachineSub } from "../data/preventiveMaintenanceData";
import {
  fetchMachines,
  fetchSchedules,
  fetchApprovedOrders,
  fetchPreventiveTypes,
  type MachineRecord,
  type ScheduleRecord,
  type ApprovedOrderRecord,
  type PreventiveTypeRecord,
} from "../services/pmoApi";

/**
 * NOTE FOR INTEGRATION
 * ---------------------------------------------------------------------------
 * This page reads:
 *  - fetchMachines()        -> Y axis (rows), grouped by machine.kategori
 *  - fetchSchedules()       -> yellow cells (plotted/scheduled preventive types)
 *  - fetchApprovedOrders()  -> green cells (status === "Completed")
 *
 * These are exactly the same schedule + approved-order rows produced by
 * YearlyPreventiveSchedule.tsx's "Manager Approval & Send" action
 * (approveForPmo -> createApprovedOrder with status "In Progress"), which
 * PreventiveMaintenanceOrder.tsx later flips to "Completed". So this page
 * will automatically reflect anything approved/sent from the yearly
 * schedule page, no extra wiring needed on that end.
 *
 * Still needs: registering this page as a route + sidebar link (see chat).
 * ---------------------------------------------------------------------------
 */

const monthAbbrev = [
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

const WEEKS_PER_MONTH = 5;

const subTabs: { key: MachineSub; label: string }[] = [
  { key: "BLD", label: "BLD" },
  { key: "UTY", label: "UTY" },
  { key: "MTC", label: "MTC" },
];

type TabKey = MachineSub | "Dashboard";

type CellStatus = "scheduled" | "completed";

type MatrixCell = {
  types: string[];
  status: CellStatus;
};

type MachineRow = {
  machineId: string;
  assetNumber: string;
  machineName: string;
  location: string | null;
};

const splitTypes = (raw: string | null | undefined): string[] =>
  String(raw ?? "")
    .split(/[,+/]/)
    .map((type) => type.trim().replace(/\s+/g, " "))
    .filter(Boolean);

const cellKey = (month: number, week: number) => `${month}-${week}`;

export default function YearlyScheduleMatrix() {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  // Empty array = "Full Year" (every month shown), otherwise the exact set
  // of months to show as matrix columns - lets the user pick a couple of
  // months at once instead of only ever one month or all twelve.
  const [selectedMonths, setSelectedMonths] = useState<number[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>("UTY");
  const [machineRecords, setMachineRecords] = useState<MachineRecord[]>([]);
  const [schedules, setSchedules] = useState<ScheduleRecord[]>([]);
  const [orders, setOrders] = useState<ApprovedOrderRecord[]>([]);
  const [preventiveTypes, setPreventiveTypes] = useState<PreventiveTypeRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const MATRIX_ROWS_PAGE_SIZE = 20;
  const [currentMatrixPage, setCurrentMatrixPage] = useState(1);

  useEffect(() => {
    const loadAll = async () => {
      try {
        setIsLoading(true);
        const [machines, scheduleRows, orderRows, typeRows] = await Promise.all([
          fetchMachines(),
          fetchSchedules(),
          fetchApprovedOrders(),
          fetchPreventiveTypes(),
        ]);
        setMachineRecords(machines);
        setSchedules(scheduleRows);
        setOrders(orderRows);
        setPreventiveTypes(typeRows);
      } catch (error) {
        console.error("Failed to load yearly schedule matrix data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    void loadAll();
  }, []);

  // Year filter reflects whatever years actually have schedule or order data,
  // plus the current year and the selected year, so the dropdown is never
  // empty and never loses a valid selection.
  const yearOptions = useMemo(() => {
    const years = new Set<number>();
    schedules.forEach((sched) => years.add(sched.tahun));
    orders.forEach((order) => years.add(order.year));
    years.add(new Date().getFullYear());
    years.add(selectedYear);
    return Array.from(years).sort((a, b) => a - b);
  }, [schedules, orders, selectedYear]);

  // Which month columns the matrix table renders: all 12 for "All", or just
  // the one selected month, so picking a month narrows the table instead of
  // just filtering rows.
  const monthsToShow = useMemo(
    () =>
      selectedMonths.length === 0
        ? Array.from({ length: 12 }, (_, i) => i)
        : [...selectedMonths].sort((a, b) => a - b),
    [selectedMonths],
  );

  const toggleMonth = (month: number) => {
    setSelectedMonths((prev) =>
      prev.includes(month) ? prev.filter((m) => m !== month) : [...prev, month],
    );
  };

  // machine list, grouped by sub (BLD / UTY / MTC), keyed by machine no
  const machinesBySub = useMemo(() => {
    const map = new Map<MachineSub, MachineRow[]>();
    for (const tab of subTabs) map.set(tab.key, []);

    for (const machine of machineRecords) {
      const sub = machine.kategori as MachineSub;
      if (!map.has(sub)) continue;
      map.get(sub)!.push({
        machineId: String(machine.no),
        assetNumber: machine.kode_mesin,
        machineName: machine.nama_mesin,
        location: machine.lokasi,
      });
    }

    for (const list of map.values()) {
      list.sort((a, b) => a.assetNumber.localeCompare(b.assetNumber));
    }

    return map;
  }, [machineRecords]);

  // machine_no -> sub, used so orders/schedules can be attributed to the
  // right tab even if a row's own `sub` field is missing/stale
  const subByMachineId = useMemo(() => {
    const map = new Map<string, MachineSub>();
    for (const machine of machineRecords) {
      map.set(String(machine.no), machine.kategori as MachineSub);
    }
    return map;
  }, [machineRecords]);

  // Some schedule/order rows store the preventive type as its full
  // descriptive name (e.g. "Service", "Cuci Filter") rather than its short
  // abbreviation ("S", "CF"). This resolves either form to the short
  // abbreviation, so the matrix always displays compact codes joined with
  // " + " (e.g. "S + CF") instead of full names wrapping across lines.
  //
  // Requires the 20260904_fix_preventive_types_column_swap.sql migration:
  // preventive_types.abbreviation must hold the short code and .parameter
  // must hold the full name (matching what the column names say) for this
  // to resolve correctly.
  const normalizeLabel = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

  const abbreviationLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of preventiveTypes) {
      map.set(normalizeLabel(t.abbreviation), t.abbreviation);
      map.set(normalizeLabel(t.parameter), t.abbreviation);
    }
    return map;
  }, [preventiveTypes]);

  // Tracks which raw type strings we've already warned about, so the same
  // unresolved value doesn't spam the console every render. A ref (not
  // state) since it's just a dedupe cache, not something that should
  // trigger a re-render - reset it whenever preventiveTypes changes so a
  // value that previously failed to resolve gets a fresh chance (and a
  // fresh warning if it still fails) once new reference data loads.
  const unresolvedTypesWarnedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    unresolvedTypesWarnedRef.current = new Set();
  }, [preventiveTypes]);

  const resolveAbbreviation = useCallback(
    (raw: string): string => {
      const key = normalizeLabel(raw);
      const exact = abbreviationLookup.get(key);
      if (exact) return exact;

      // Fuzzy fallback: the stored text might not match the full-name column
      // word-for-word (e.g. "Cuci Filter AC" vs. the reference table's
      // "Cuci Filter"). Try a substring match either direction before
      // giving up and showing the raw text as-is.
      const fuzzy = preventiveTypes.find((t) => {
        const full = normalizeLabel(t.parameter);
        return full.length > 2 && (key.includes(full) || full.includes(key));
      });
      if (fuzzy) return fuzzy.abbreviation;

      if (preventiveTypes.length > 0 && !unresolvedTypesWarnedRef.current.has(key)) {
        unresolvedTypesWarnedRef.current.add(key);
        console.warn(
          `[YearlyScheduleMatrix] Could not match preventive type "${raw}" to any known type. ` +
            `Known names: ${preventiveTypes.map((t) => t.parameter).join(", ")}`,
        );
      }
      return raw;
    },
    [abbreviationLookup, preventiveTypes],
  );

  const splitTypesAsAbbreviations = useCallback(
    (raw: string | null | undefined): string[] => splitTypes(raw).map(resolveAbbreviation),
    [resolveAbbreviation],
  );

  // matrix: machineId -> "month-week" -> { types, status }
  // scheduled entries plot yellow; a Completed order upgrades that cell to green
  const matrix = useMemo(() => {
    const map = new Map<string, Map<string, MatrixCell>>();

    const upsert = (
      machineId: string,
      month: number,
      week: number,
      types: string[],
      status: CellStatus,
    ) => {
      if (!map.has(machineId)) map.set(machineId, new Map());
      const machineMap = map.get(machineId)!;
      const key = cellKey(month, week);
      const existing = machineMap.get(key);

      if (!existing) {
        machineMap.set(key, { types, status });
        return;
      }

      machineMap.set(key, {
        types: Array.from(new Set([...existing.types, ...types])),
        status: existing.status === "completed" ? "completed" : status,
      });
    };

    for (const sched of schedules) {
      if (sched.tahun !== selectedYear) continue;
      upsert(
        String(sched.machine_no),
        sched.bulan,
        sched.minggu,
        splitTypesAsAbbreviations(sched.preventive_types),
        "scheduled",
      );
    }

    for (const order of orders) {
      if (order.year !== selectedYear) continue;
      if (order.status !== "Completed") continue;
      upsert(
        String(order.machine_no),
        order.month,
        order.week,
        splitTypesAsAbbreviations(order.preventive_types),
        "completed",
      );
    }

    return map;
  }, [schedules, orders, selectedYear, splitTypesAsAbbreviations]);

  const currentMachines = useMemo(() => {
    if (activeTab === "Dashboard") return [];
    const list = machinesBySub.get(activeTab) ?? [];
    if (!searchText.trim()) return list;
    const q = searchText.toLowerCase();
    return list.filter(
      (m) =>
        m.machineName.toLowerCase().includes(q) ||
        m.assetNumber.toLowerCase().includes(q) ||
        (m.location?.toLowerCase().includes(q) ?? false),
    );
  }, [machinesBySub, activeTab, searchText]);

  // Reset to page 1 whenever the filtered row set changes underneath the table
  useEffect(() => {
    setCurrentMatrixPage(1);
  }, [activeTab, selectedYear, selectedMonths, searchText]);

  const matrixPageCount = Math.max(1, Math.ceil(currentMachines.length / MATRIX_ROWS_PAGE_SIZE));

  useEffect(() => {
    setCurrentMatrixPage((page) => Math.min(page, matrixPageCount));
  }, [matrixPageCount]);

  const paginatedMatrixMachines = useMemo(
    () =>
      currentMachines.slice(
        (currentMatrixPage - 1) * MATRIX_ROWS_PAGE_SIZE,
        currentMatrixPage * MATRIX_ROWS_PAGE_SIZE,
      ),
    [currentMachines, currentMatrixPage],
  );

  // progress dashboard stats: per sub and per sub+month
  const dashboardStats = useMemo(() => {
    const perSub: Record<MachineSub, { scheduled: number; completed: number }> = {
      BLD: { scheduled: 0, completed: 0 },
      UTY: { scheduled: 0, completed: 0 },
      MTC: { scheduled: 0, completed: 0 },
    };

    const perSubMonth: Record<MachineSub, { scheduled: number; completed: number }[]> = {
      BLD: monthAbbrev.map(() => ({ scheduled: 0, completed: 0 })),
      UTY: monthAbbrev.map(() => ({ scheduled: 0, completed: 0 })),
      MTC: monthAbbrev.map(() => ({ scheduled: 0, completed: 0 })),
    };

    for (const sched of schedules) {
      if (sched.tahun !== selectedYear) continue;
      const sub = sched.sub ?? subByMachineId.get(String(sched.machine_no));
      if (!sub || !perSub[sub]) continue;
      perSub[sub].scheduled += 1;
      if (sched.bulan >= 0 && sched.bulan < 12) {
        perSubMonth[sub][sched.bulan].scheduled += 1;
      }
    }

    for (const order of orders) {
      if (order.year !== selectedYear || order.status !== "Completed") continue;
      const sub = order.sub ?? subByMachineId.get(String(order.machine_no));
      if (!sub || !perSub[sub]) continue;
      perSub[sub].completed += 1;
      if (order.month >= 0 && order.month < 12) {
        perSubMonth[sub][order.month].completed += 1;
      }
    }

    return { perSub, perSubMonth };
  }, [schedules, orders, subByMachineId, selectedYear]);

  const pct = (completed: number, scheduled: number) =>
    scheduled === 0 ? 0 : Math.min(100, Math.round((completed / scheduled) * 100));

  // ------------------------------------------------------------------
  // Export (CSV / Excel / PDF), matching the uploaded YEARLY_Excel_Template
  // layout: NO MESIN | NAMA MESIN | DAYA/KAPASITAS | NAMA RUANG |
  // INTERVAL | JAN..DES (each split into W1-W5) | KETERANGAN.
  //
  // Always exports the FULL machine list for the active sub and all 12
  // months, regardless of the on-screen search box or Months chips - this
  // is meant to be the complete official record for the year, not a
  // narrowed view of what's currently on screen.
  // ------------------------------------------------------------------
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [exportError, setExportError] = useState("");

  const monthAbbrevID = ["JAN", "FEB", "MAR", "APR", "MEI", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DES"];

  const buildExportRows = () => {
    if (activeTab === "Dashboard") return [];
    return (machinesBySub.get(activeTab) ?? []).map((machine) => ({
      machine,
      weeks: Array.from({ length: 12 }, (_, month) =>
        Array.from({ length: WEEKS_PER_MONTH }, (_, i) => matrix.get(machine.machineId)?.get(cellKey(month, i + 1)) ?? null),
      ),
    }));
  };

  const exportEscapeCsv = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const exportEscapeHtml = (value: unknown) =>
    String(value ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c] || c));

  const handleExportCsv = () => {
    if (activeTab === "Dashboard") return;
    const rows = buildExportRows();

    const monthHeaderRow = ["NO MESIN", "NAMA MESIN", "DAYA / KAPASITAS", "NAMA RUANG", "INTERVAL (BULAN / SEKALI)"];
    monthAbbrevID.forEach((m) => monthHeaderRow.push(m, "", "", "", ""));
    monthHeaderRow.push("KETERANGAN");

    const weekHeaderRow = ["", "", "", "", ""];
    for (let m = 0; m < 12; m++) weekHeaderRow.push("1", "2", "3", "4", "5");
    weekHeaderRow.push("");

    const dataRows = rows.map(({ machine, weeks }) => {
      const row = [machine.assetNumber, machine.machineName, "", machine.location ?? "", ""];
      weeks.forEach((month) => month.forEach((cell) => row.push(cell?.types.join(" + ") ?? "")));
      row.push("");
      return row;
    });

    const csv = [
      [`YEARLY PREVENTIVE ENGINEERING SCHEDULE - ${activeTab} SUB DEPARTMENT (${selectedYear})`],
      [],
      monthHeaderRow,
      weekHeaderRow,
      ...dataRows,
    ]
      .map((line) => line.map(exportEscapeCsv).join(","))
      .join("\r\n");

    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Yearly_Schedule_${activeTab}_${selectedYear}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPdf = () => {
    if (activeTab === "Dashboard") return;
    const reportWindow = window.open("", "_blank");
    if (!reportWindow) {
      setExportError("Allow pop-ups in your browser to export the PDF.");
      return;
    }

    const rows = buildExportRows();
    const monthHeaderCells = monthAbbrevID.map((m) => `<th colspan="5">${m}</th>`).join("");
    const weekHeaderCells = Array.from({ length: 12 }, () => "<th>1</th><th>2</th><th>3</th><th>4</th><th>5</th>").join("");

    const bodyRows = rows
      .map(({ machine, weeks }) => {
        const weekCells = weeks
          .map((month) =>
            month
              .map((cell) => {
                const bg = cell?.status === "completed" ? "#bbf7d0" : cell?.status === "scheduled" ? "#fef08a" : "";
                return `<td style="background:${bg};">${exportEscapeHtml(cell?.types.join(" + ") ?? "")}</td>`;
              })
              .join(""),
          )
          .join("");
        return `<tr>
          <td>${exportEscapeHtml(machine.assetNumber)}</td>
          <td>${exportEscapeHtml(machine.machineName)}</td>
          <td></td>
          <td>${exportEscapeHtml(machine.location)}</td>
          <td></td>
          ${weekCells}
          <td></td>
        </tr>`;
      })
      .join("");

    reportWindow.document.write(`<!doctype html>
      <html><head><title>Yearly Schedule - ${exportEscapeHtml(activeTab)} ${selectedYear}</title><style>
        @page { size: A3 landscape; margin: 10mm; }
        body { color: #111; font: 8px Arial, sans-serif; }
        h1 { font-size: 14px; text-align: center; margin: 0 0 10px; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #999; padding: 2px 3px; text-align: center; }
        th { background: #f1f5f9; font-weight: 700; }
        td:nth-child(1), td:nth-child(2), td:nth-child(4) { text-align: left; }
      </style></head><body>
      <h1>YEARLY PREVENTIVE ENGINEERING SCHEDULE - ${exportEscapeHtml(activeTab)} SUB DEPARTMENT (${selectedYear})</h1>
      <table>
        <thead>
          <tr><th rowspan="2">NO MESIN</th><th rowspan="2">NAMA MESIN</th><th rowspan="2">DAYA / KAPASITAS</th>
              <th rowspan="2">NAMA RUANG</th><th rowspan="2">INTERVAL</th>${monthHeaderCells}<th rowspan="2">KETERANGAN</th></tr>
          <tr>${weekHeaderCells}</tr>
        </thead>
        <tbody>${bodyRows}</tbody>
      </table>
      </body></html>`);
    reportWindow.document.close();
    reportWindow.focus();
    reportWindow.print();
  };

  const handleExportExcel = async () => {
    if (activeTab === "Dashboard") return;
    setIsExportingExcel(true);
    setExportError("");
    try {
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet(`${selectedYear} (${activeTab})`);

      const totalCols = 5 + 12 * WEEKS_PER_MONTH + 1; // fixed cols + 12 months x 5 weeks + notes
      sheet.columns = [
        { width: 12 }, { width: 28 }, { width: 18 }, { width: 24 }, { width: 14 },
        ...Array.from({ length: 12 * WEEKS_PER_MONTH }, () => ({ width: 5 })),
        { width: 22 },
      ];

      // Title row
      sheet.mergeCells(1, 1, 1, totalCols);
      const titleCell = sheet.getCell(1, 1);
      titleCell.value = `YEARLY PREVENTIVE ENGINEERING SCHEDULE\n${activeTab} SUB DEPARTMENT (${selectedYear})`;
      titleCell.font = { name: "Arial", size: 16, bold: true };
      titleCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      sheet.getRow(1).height = 40;

      // Fixed-column headers (span rows 3-5, matching the template)
      const headerRow = 3;
      const fixedHeaders = ["NO MESIN", "NAMA MESIN", "DAYA / KAPASITAS", "NAMA RUANG", "INTERVAL (BULAN / SEKALI)"];
      fixedHeaders.forEach((label, idx) => {
        const col = idx + 1;
        sheet.mergeCells(headerRow, col, headerRow + 2, col);
        const cell = sheet.getCell(headerRow, col);
        cell.value = label;
        cell.font = { name: "Verdana", size: 8, bold: true };
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        cell.border = { top: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" }, bottom: { style: "thin" } };
      });

      // Month headers (row 3-4 merged, spanning 5 week-columns each) + week numbers (row 5)
      monthAbbrevID.forEach((month, mIdx) => {
        const startCol = 6 + mIdx * WEEKS_PER_MONTH;
        sheet.mergeCells(headerRow, startCol, headerRow + 1, startCol + WEEKS_PER_MONTH - 1);
        const monthCell = sheet.getCell(headerRow, startCol);
        monthCell.value = month;
        monthCell.font = { name: "Verdana", size: 8, bold: true };
        monthCell.alignment = { horizontal: "center", vertical: "middle" };

        for (let w = 0; w < WEEKS_PER_MONTH; w++) {
          const col = startCol + w;
          const weekCell = sheet.getCell(headerRow + 2, col);
          weekCell.value = w + 1;
          weekCell.font = { name: "Verdana", size: 8 };
          weekCell.alignment = { horizontal: "center", vertical: "middle" };
          for (let r = headerRow; r <= headerRow + 2; r++) {
            sheet.getCell(r, col).border = { top: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" }, bottom: { style: "thin" } };
          }
        }
      });

      // Notes column header
      const notesCol = totalCols;
      sheet.mergeCells(headerRow, notesCol, headerRow + 2, notesCol);
      const notesHeader = sheet.getCell(headerRow, notesCol);
      notesHeader.value = "KETERANGAN";
      notesHeader.font = { name: "Verdana", size: 8, bold: true };
      notesHeader.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      notesHeader.border = { top: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" }, bottom: { style: "thin" } };

      // Data rows
      const rows = buildExportRows();
      let r = headerRow + 3;
      for (const { machine, weeks } of rows) {
        sheet.getCell(r, 1).value = machine.assetNumber;
        sheet.getCell(r, 2).value = machine.machineName;
        sheet.getCell(r, 3).value = "";
        sheet.getCell(r, 4).value = machine.location ?? "";
        sheet.getCell(r, 5).value = "";

        for (let c = 1; c <= 5; c++) {
          const cell = sheet.getCell(r, c);
          cell.font = { name: "Verdana", size: 8, bold: c === 1 };
          cell.alignment = { horizontal: c === 1 ? "center" : "left", vertical: "middle", wrapText: true };
          cell.border = { top: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" }, bottom: { style: "thin" } };
        }

        weeks.forEach((month, mIdx) => {
          month.forEach((cellData, wIdx) => {
            const col = 6 + mIdx * WEEKS_PER_MONTH + wIdx;
            const cell = sheet.getCell(r, col);
            cell.value = cellData?.types.join(" + ") ?? "";
            cell.font = { name: "Verdana", size: 8 };
            cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
            cell.border = { top: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" }, bottom: { style: "thin" } };
            if (cellData?.status === "completed") {
              cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF92D050" } };
            } else if (cellData?.status === "scheduled") {
              cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE066" } };
            }
          });
        });

        const notesCell = sheet.getCell(r, notesCol);
        notesCell.value = "";
        notesCell.border = { top: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" }, bottom: { style: "thin" } };

        r += 1;
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Yearly_Schedule_${activeTab}_${selectedYear}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Excel export failed:", error);
      setExportError(
        error instanceof Error && /Cannot find module|Failed to fetch dynamically imported module/.test(error.message)
          ? 'Excel export needs the "exceljs" package - run `npm install exceljs` in the frontend project.'
          : "Failed to export Excel file.",
      );
    } finally {
      setIsExportingExcel(false);
    }
  };

  return (
    <>
      <PageMeta
        title="Yearly Schedule Matrix"
        description="Yearly preventive schedule matrix and completion dashboard by machine group"
      />
      <PageBreadcrumb pageTitle="Yearly Schedule Matrix" />

      <div className="space-y-6">
        <ComponentCard title="Matrix Controls">
          <div className="grid gap-4 md:grid-cols-4">
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

            <label className="text-sm text-gray-700 dark:text-gray-300 md:col-span-2">
              <span className="mb-2 block">
                Months
                {selectedMonths.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedMonths([])}
                    className="ml-2 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
                  >
                    Clear (show Full Year)
                  </button>
                )}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {monthAbbrev.map((month, index) => {
                  const isSelected = selectedMonths.includes(index);
                  return (
                    <button
                      key={month}
                      type="button"
                      onClick={() => toggleMonth(index)}
                      aria-pressed={isSelected}
                      className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                        isSelected
                          ? "border-brand-500 bg-brand-500 text-white"
                          : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                      }`}
                    >
                      {month}
                    </button>
                  );
                })}
              </div>
            </label>

            {activeTab !== "Dashboard" && (
              <label className="text-sm text-gray-700 dark:text-gray-300 md:col-span-1">
                <span className="mb-2 block">Search machines</span>
                <input
                  type="text"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="Search by name, asset code, or location"
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </label>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-4 dark:border-white/[0.05]">
            {subTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                  activeTab === tab.key
                    ? "bg-brand-500 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
                }`}
              >
                {tab.label}
              </button>
            ))}
            {/* <button
              onClick={() => setActiveTab("Dashboard")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                activeTab === "Dashboard"
                  ? "bg-brand-500 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
              }`}
            >
              Progress Dashboard
            </button> */}
          </div>

          {activeTab !== "Dashboard" && (
            <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-gray-600 dark:text-gray-300">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-sm bg-yellow-300" /> Plotted / Scheduled
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-sm bg-green-400" /> Completed
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-sm border border-gray-300" /> Not scheduled
              </span>
              {isLoading && <span className="italic text-gray-400">Loading...</span>}
            </div>
          )}
        </ComponentCard>

        {activeTab !== "Dashboard" ? (
          <ComponentCard
            title={`${activeTab} - Matrix (${
              selectedMonths.length === 0
                ? "Full Year"
                : monthsToShow.map((m) => monthAbbrev[m]).join(", ")
            } ${selectedYear})`}
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-gray-600 dark:text-gray-300">
                {dashboardStats.perSub[activeTab].completed} of{" "}
                {dashboardStats.perSub[activeTab].scheduled} scheduled entries completed (
                {pct(dashboardStats.perSub[activeTab].completed, dashboardStats.perSub[activeTab].scheduled)}
                %)
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  Export CSV
                </button>
                <button
                  type="button"
                  onClick={() => void handleExportExcel()}
                  disabled={isExportingExcel}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  {isExportingExcel ? "Exporting..." : "Export Excel"}
                </button>
                <button
                  type="button"
                  onClick={handleExportPdf}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  Export PDF
                </button>
              </div>
            </div>
            {exportError && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300">
                {exportError}
              </div>
            )}

            <div className="overflow-auto rounded-xl border border-gray-200 dark:border-white/[0.05]" style={{ maxHeight: "70vh" }}>
              <table className="border-collapse text-[10px]">
                <thead>
                  <tr>
                    <th
                      className="sticky top-0 left-0 z-30 border border-gray-200 bg-gray-50 px-2 py-2 text-left text-gray-700 dark:border-white/[0.05] dark:bg-gray-800 dark:text-gray-200"
                      style={{ minWidth: 90, position: "sticky", left: 0 }}
                      rowSpan={2}
                    >
                      Asset Code
                    </th>
                    <th
                      className="sticky top-0 z-30 border border-gray-200 bg-gray-50 px-2 py-2 text-left text-gray-700 dark:border-white/[0.05] dark:bg-gray-800 dark:text-gray-200"
                      style={{ minWidth: 200, position: "sticky", left: 90 }}
                      rowSpan={2}
                    >
                      Machine Name
                    </th>
                    <th
                      className="sticky top-0 z-30 border border-gray-200 bg-gray-50 px-2 py-2 text-left text-gray-700 dark:border-white/[0.05] dark:bg-gray-800 dark:text-gray-200"
                      style={{ minWidth: 160, position: "sticky", left: 290 }}
                      rowSpan={2}
                    >
                      Location
                    </th>
                    {monthsToShow.map((month) => (
                      <th
                        key={month}
                        colSpan={WEEKS_PER_MONTH}
                        className="sticky top-0 z-20 border border-gray-200 bg-gray-50 px-1 py-1 text-center text-gray-700 dark:border-white/[0.05] dark:bg-gray-800 dark:text-gray-200"
                      >
                        {monthAbbrev[month]}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {monthsToShow.flatMap((month) =>
                      Array.from({ length: WEEKS_PER_MONTH }, (_, i) => (
                        <th
                          key={`${month}-w${i + 1}`}
                          className="sticky z-20 border border-gray-200 bg-gray-50 px-1 py-1 text-center text-gray-700 dark:border-white/[0.05] dark:bg-gray-800 dark:text-gray-200"
                          style={{ top: 28, minWidth: 26 }}
                        >
                          W{i + 1}
                        </th>
                      )),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {paginatedMatrixMachines.map((machine) => (
                    <tr key={machine.machineId}>
                      <td
                        className="border border-gray-200 bg-white px-2 py-1 font-medium text-gray-700 dark:border-white/[0.05] dark:bg-gray-900 dark:text-gray-200"
                        style={{ position: "sticky", left: 0, zIndex: 10 }}
                      >
                        {machine.assetNumber}
                      </td>
                      <td
                        className="border border-gray-200 bg-white px-2 py-1 text-gray-700 dark:border-white/[0.05] dark:bg-gray-900 dark:text-gray-200"
                        style={{ position: "sticky", left: 90, zIndex: 10 }}
                      >
                        {machine.machineName}
                      </td>
                      <td
                        className="border border-gray-200 bg-white px-2 py-1 text-gray-700 dark:border-white/[0.05] dark:bg-gray-900 dark:text-gray-200"
                        style={{ position: "sticky", left: 290, zIndex: 10 }}
                      >
                        {machine.location}
                      </td>
                      {monthsToShow.map((month) =>
                        Array.from({ length: WEEKS_PER_MONTH }, (_, i) => {
                          const week = i + 1;
                          const cell = matrix.get(machine.machineId)?.get(cellKey(month, week));
                          const bg =
                            cell?.status === "completed"
                              ? "bg-green-300 dark:bg-green-700/70"
                              : cell?.status === "scheduled"
                                ? "bg-yellow-200 dark:bg-yellow-600/60"
                                : "";
                          return (
                            <td
                              key={`${machine.machineId}-${month}-${week}`}
                              className={`whitespace-nowrap border border-gray-200 px-1 py-1 text-center text-[9px] font-semibold text-gray-800 dark:border-white/[0.05] dark:text-gray-100 ${bg}`}
                              title={cell?.types.join(" + ")}
                            >
                              {cell?.types.join(" + ") ?? ""}
                            </td>
                          );
                        }),
                      )}
                    </tr>
                  ))}
                  {!isLoading && currentMachines.length === 0 && (
                    <tr>
                      <td colSpan={3 + monthsToShow.length * WEEKS_PER_MONTH} className="px-4 py-6 text-center text-gray-400">
                        No machines found for {activeTab}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {!isLoading && currentMachines.length > 0 && (
              <div className="mt-3 flex flex-col items-center justify-between gap-2 sm:flex-row">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Showing {(currentMatrixPage - 1) * MATRIX_ROWS_PAGE_SIZE + 1}-
                  {Math.min(currentMatrixPage * MATRIX_ROWS_PAGE_SIZE, currentMachines.length)} of{" "}
                  {currentMachines.length} machines
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentMatrixPage((p) => Math.max(1, p - 1))}
                    disabled={currentMatrixPage <= 1}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-200"
                  >
                    Previous
                  </button>
                  <span className="text-xs text-gray-600 dark:text-gray-300">
                    Page {currentMatrixPage} of {matrixPageCount}
                  </span>
                  <button
                    onClick={() => setCurrentMatrixPage((p) => Math.min(matrixPageCount, p + 1))}
                    disabled={currentMatrixPage >= matrixPageCount}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-200"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </ComponentCard>
        ) : (
          <YearlyProgressDashboard
            year={selectedYear}
            showYearSelector={false}
            machines={machineRecords}
            schedules={schedules}
            orders={orders}
            isLoading={isLoading}
          />
        )}
      </div>
    </>
  );
}
