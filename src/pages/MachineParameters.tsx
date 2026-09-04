import { useEffect, useMemo, useRef, useState } from "react";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import ComponentCard from "../components/common/ComponentCard";
import PageMeta from "../components/common/PageMeta";
import Button from "../components/ui/button/Button";
import {
  fetchMachines,
  fetchMachineParameters,
  createMachineParameter,
  updateMachineParameter,
  deleteMachineParameter,
  bulkCreateMachineParameters,
  type MachineRecord,
  type MachineParameterRecord,
} from "../services/pmoApi";

type ParameterRow = {
  id: number;
  machine_no: number;
  machineName: string;
  machineAsset: string;
  part_master: string;
  part_checklist: string;
  action: string;
  standard: string;
};

const PAGE_SIZE = 30;

const toCsvValue = (value: string) => {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const parseCsvLine = (line: string): string[] => {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result.map((value) => value.trim());
};

export default function MachineParameters() {
  const [rows, setRows] = useState<ParameterRow[]>([]);
  const [machines, setMachines] = useState<MachineRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [machineFilter, setMachineFilter] = useState<string>("All");
  const [subFilter, setSubFilter] = useState<string>("All");
  const [partMasterFilter, setPartMasterFilter] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [message, setMessage] = useState("");
  const [page, setPage] = useState(0);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [newRow, setNewRow] = useState({ machine_no: "", part_master: "", part_checklist: "", action: "", standard: "" });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editRow, setEditRow] = useState({ part_master: "", part_checklist: "", action: "", standard: "" });

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [machinesData, paramsData] = await Promise.all([fetchMachines(), fetchMachineParameters()]);
      setMachines(machinesData);
      setRows(
        paramsData.map((p: MachineParameterRecord) => ({
          id: p.id,
          machine_no: p.machine_no,
          machineName: p.machine_name || `Machine ${p.machine_no}`,
          machineAsset: p.machine_asset || String(p.machine_no),
          part_master: p.part_master,
          part_checklist: p.part_checklist,
          action: p.action || "",
          standard: p.standard || "",
        })),
      );
    } catch (error) {
      console.error("Failed to load machine parameters:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const partMasterOptions = useMemo(
    () => Array.from(new Set(rows.map((row) => row.part_master).filter(Boolean))).sort(),
    [rows],
  );

  // Machine sub (UTY / MTC / BLD) options, derived from whatever categories exist on the loaded machines
  const subOptions = useMemo(
    () => Array.from(new Set(machines.map((m) => m.kategori).filter(Boolean))).sort(),
    [machines],
  );

  const machineSubByNo = useMemo(() => {
    const map = new Map<number, string>();
    for (const m of machines) map.set(m.no, m.kategori);
    return map;
  }, [machines]);

  // Machines list narrowed to the selected sub, used to drive the machine filter dropdown + prev/next stepper
  const machinesForSubFilter = useMemo(
    () => (subFilter === "All" ? machines : machines.filter((m) => m.kategori === subFilter)),
    [machines, subFilter],
  );

  // If the sub filter changes and the currently selected machine no longer belongs to it, reset to "All Machines"
  useEffect(() => {
    if (machineFilter === "All") return;
    const stillValid = machinesForSubFilter.some((m) => String(m.no) === machineFilter);
    if (!stillValid) {
      setMachineFilter("All");
    }
  }, [subFilter, machinesForSubFilter, machineFilter]);

  // Same guard for the "Add Parameter" machine selector
  useEffect(() => {
    setNewRow((prev) => {
      if (!prev.machine_no) return prev;
      const stillValid = machinesForSubFilter.some((m) => String(m.no) === prev.machine_no);
      return stillValid ? prev : { ...prev, machine_no: "" };
    });
  }, [subFilter, machinesForSubFilter]);

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesSub = subFilter === "All" || machineSubByNo.get(row.machine_no) === subFilter;
      const matchesMachine = machineFilter === "All" || String(row.machine_no) === machineFilter;
      const matchesPartMaster = partMasterFilter === "All" || row.part_master === partMasterFilter;
      const matchesSearch =
        !query ||
        row.machineName.toLowerCase().includes(query) ||
        row.machineAsset.toLowerCase().includes(query) ||
        row.part_master.toLowerCase().includes(query) ||
        row.part_checklist.toLowerCase().includes(query) ||
        row.action.toLowerCase().includes(query) ||
        row.standard.toLowerCase().includes(query);
      return matchesSub && matchesMachine && matchesPartMaster && matchesSearch;
    });
  }, [rows, subFilter, machineSubByNo, machineFilter, partMasterFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const paginatedRows = filteredRows.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  useEffect(() => {
    setPage(0);
  }, [subFilter, machineFilter, partMasterFilter, searchQuery]);

  const machineIndex = machinesForSubFilter.findIndex((machine) => String(machine.no) === machineFilter);
  const stepMachine = (direction: 1 | -1) => {
    if (!machinesForSubFilter.length) return;
    const nextIndex =
      machineIndex === -1 ? (direction === 1 ? 0 : machinesForSubFilter.length - 1) : machineIndex + direction;
    if (nextIndex < 0 || nextIndex >= machinesForSubFilter.length) return;
    setMachineFilter(String(machinesForSubFilter[nextIndex].no));
  };

  const handleAddRow = async () => {
    if (!newRow.machine_no || !newRow.part_master.trim() || !newRow.part_checklist.trim()) {
      setMessage("Machine, Part Master, and Part Checklist are required.");
      return;
    }
    try {
      await createMachineParameter({
        machine_no: Number(newRow.machine_no),
        part_master: newRow.part_master.trim(),
        part_checklist: newRow.part_checklist.trim(),
        action: newRow.action || null,
        standard: newRow.standard || null,
      });
      setNewRow({ machine_no: "", part_master: "", part_checklist: "", action: "", standard: "" });
      setMessage("Parameter added.");
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to add parameter.");
    }
  };

  const startEdit = (row: ParameterRow) => {
    setEditingId(row.id);
    setEditRow({ part_master: row.part_master, part_checklist: row.part_checklist, action: row.action, standard: row.standard });
  };

  const saveEdit = async (id: number) => {
    try {
      await updateMachineParameter(id, {
        part_master: editRow.part_master,
        part_checklist: editRow.part_checklist,
        action: editRow.action || null,
        standard: editRow.standard || null,
      });
      setEditingId(null);
      setMessage("Parameter updated.");
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to update parameter.");
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteMachineParameter(id);
      setMessage("Parameter deleted.");
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to delete parameter.");
    }
  };

  const handleExportCsv = () => {
    const header = ["Asset_Name", "Asset_Code", "Part_Master", "Part_Checklist", "Action", "Standard"];
    const lines = filteredRows.map((row) =>
      [row.machineName, row.machineAsset, row.part_master, row.part_checklist, row.action, row.standard].map(toCsvValue).join(","),
    );
    const csv = [header.join(","), ...lines].join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "machine_parameters.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadTemplate = () => {
    const header = ["Asset_Name", "Asset_Code", "Part_Master", "Part_Checklist", "Action", "Standard"];
    // Pre-fill Asset_Name / Asset_Code from the actual machines already in the database,
    // so the user can't mistype the values used to match each row to a machine.
    const lines = machines.map((m) => [m.nama_mesin, m.kode_mesin, "", "", "", ""].map(toCsvValue).join(","));
    const csv = [header.join(","), ...lines].join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "machine_parameters_template.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleImportCsv = async (file: File) => {
    const text = await file.text();
    const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 2) {
      setMessage("CSV file has no data rows.");
      return;
    }

    const machineByName = new Map(machines.map((m) => [m.nama_mesin.trim().toLowerCase(), m.no]));
    const machineByAsset = new Map(machines.map((m) => [m.kode_mesin.trim().toLowerCase(), m.no]));

    // Existing parameter rows, keyed by machine + Part_Master + Part_Checklist + Action, so a matching
    // CSV row is treated as an overwrite (updating Standard) instead of a duplicate insert.
    const normalize = (value: string) => (value || "").trim().toLowerCase();
    const existingByKey = new Map<string, ParameterRow>();
    for (const row of rows) {
      const key = [row.machine_no, normalize(row.part_master), normalize(row.part_checklist), normalize(row.action)].join("|");
      existingByKey.set(key, row);
    }

    const itemsToCreate: Array<{ machine_no: number; part_master: string; part_checklist: string; action?: string | null; standard?: string | null; sort_order?: number }> = [];
    const itemsToUpdate: Array<{ id: number; standard: string | null }> = [];
    const skipped: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const [assetName, assetCode, partMaster, partChecklist, action, standard] = parseCsvLine(lines[i]);
      const machineNo =
        machineByName.get((assetName || "").toLowerCase()) ?? machineByAsset.get((assetCode || "").toLowerCase());

      if (!machineNo || !partMaster || !partChecklist) {
        skipped.push(`row ${i + 1}`);
        continue;
      }

      const key = [machineNo, normalize(partMaster), normalize(partChecklist), normalize(action)].join("|");
      const existing = existingByKey.get(key);

      if (existing) {
        itemsToUpdate.push({ id: existing.id, standard: standard || null });
      } else {
        itemsToCreate.push({
          machine_no: machineNo,
          part_master: partMaster,
          part_checklist: partChecklist,
          action: action || null,
          standard: standard || null,
          sort_order: itemsToCreate.length,
        });
      }
    }

    if (!itemsToCreate.length && !itemsToUpdate.length) {
      setMessage(`Nothing imported. No rows matched a known machine (skipped: ${skipped.length}).`);
      return;
    }

    try {
      let createdCount = 0;
      if (itemsToCreate.length) {
        const result = await bulkCreateMachineParameters(itemsToCreate);
        createdCount = result.inserted;
      }

      for (const item of itemsToUpdate) {
        await updateMachineParameter(item.id, { standard: item.standard });
      }

      setMessage(
        `Imported: ${createdCount} new, ${itemsToUpdate.length} overwritten.` +
          (skipped.length ? ` Skipped ${skipped.length} row(s): ${skipped.slice(0, 5).join(", ")}${skipped.length > 5 ? "..." : ""}` : ""),
      );
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to import CSV.");
    }
  };

  const inputClass =
    "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white";

  return (
    <>
      <PageMeta title="Machine Parameters" description="Preventive maintenance parameter master list" />
      <PageBreadcrumb pageTitle="Machine Parameters" />

      <div className="space-y-6">
        <ComponentCard title="Add Parameter">
          <div className="grid gap-3 md:grid-cols-4 lg:grid-cols-7">
            <select value={subFilter} onChange={(e) => setSubFilter(e.target.value)} className={inputClass}>
              <option value="All">All Subs</option>
              {subOptions.map((sub) => (
                <option key={sub} value={sub}>
                  {sub}
                </option>
              ))}
            </select>
            <select value={newRow.machine_no} onChange={(e) => setNewRow((p) => ({ ...p, machine_no: e.target.value }))} className={inputClass}>
              <option value="">Select machine...</option>
              {machinesForSubFilter.map((m) => (
                <option key={m.no} value={m.no}>
                  {m.nama_mesin} ({m.kode_mesin})
                </option>
              ))}
            </select>
            <input value={newRow.part_master} onChange={(e) => setNewRow((p) => ({ ...p, part_master: e.target.value }))} placeholder="Part Master" className={inputClass} />
            <input value={newRow.part_checklist} onChange={(e) => setNewRow((p) => ({ ...p, part_checklist: e.target.value }))} placeholder="Part Checklist" className={inputClass} />
            <input value={newRow.action} onChange={(e) => setNewRow((p) => ({ ...p, action: e.target.value }))} placeholder="Action" className={inputClass} />
            <input value={newRow.standard} onChange={(e) => setNewRow((p) => ({ ...p, standard: e.target.value }))} placeholder="Standard" className={inputClass} />
            <Button size="sm" onClick={() => void handleAddRow()}>
              Add
            </Button>
          </div>
        </ComponentCard>

        <ComponentCard title="Parameters">
          <div className="mb-4 grid gap-3 md:grid-cols-6">
            <div className="flex items-center gap-2 md:col-span-2">
              <Button size="sm" variant="outline" onClick={() => stepMachine(-1)} disabled={!machinesForSubFilter.length}>
                ← Prev
              </Button>
              <select value={machineFilter} onChange={(e) => setMachineFilter(e.target.value)} className={`flex-1 ${inputClass}`}>
                <option value="All">All Machines</option>
                {machinesForSubFilter.map((m) => (
                  <option key={m.no} value={m.no}>
                    {m.nama_mesin} ({m.kode_mesin})
                  </option>
                ))}
              </select>
              <Button size="sm" variant="outline" onClick={() => stepMachine(1)} disabled={!machinesForSubFilter.length}>
                Next →
              </Button>
            </div>
            <select value={subFilter} onChange={(e) => setSubFilter(e.target.value)} className={inputClass}>
              <option value="All">All Subs</option>
              {subOptions.map((sub) => (
                <option key={sub} value={sub}>
                  {sub}
                </option>
              ))}
            </select>
            <select value={partMasterFilter} onChange={(e) => setPartMasterFilter(e.target.value)} className={inputClass}>
              <option value="All">All Part Masters</option>
              {partMasterOptions.map((partMaster) => (
                <option key={partMaster} value={partMaster}>
                  {partMaster}
                </option>
              ))}
            </select>
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search..." className={inputClass} />
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handleExportCsv}>
                Export CSV
              </Button>
              <Button size="sm" variant="outline" onClick={() => setIsImportModalOpen(true)}>
                Import CSV
              </Button>
              <Button size="sm" variant="outline" onClick={() => void loadData()} disabled={isLoading}>
                Refresh
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleImportCsv(file);
                  e.target.value = "";
                }}
              />
            </div>
          </div>

          {message && (
            <div className="mb-3 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-200">
              {message}
            </div>
          )}

          {isImportModalOpen && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
              <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 dark:bg-gray-900">
                <h4 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
                  Import Machine Parameters from CSV
                </h4>

                <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-200">
                  <p className="mb-2 font-semibold">📋 Import Procedure:</p>
                  <ol className="list-decimal space-y-1 pl-5">
                    <li>Download the template CSV below - it's pre-filled with every machine's Asset_Name and Asset_Code from the database.</li>
                    <li>Open the template using Excel or another spreadsheet application.</li>
                    <li>
                      Fill in as per the template:
                      <ul className="mt-1 list-disc space-y-1 pl-5">
                        <li>Asset_Name</li>
                        <li>Asset_Code</li>
                        <li>Part_Master</li>
                        <li>Part_Checklist</li>
                        <li>Action</li>
                        <li>Standard</li>
                      </ul>
                    </li>
                    <li>Save in CSV format.</li>
                    <li>Import CSV File.</li>
                  </ol>
                </div>

                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                  <p className="mb-2 font-semibold">⚠️ Important Notes:</p>
                  <ul className="list-disc space-y-1 pl-5">
                    <li>
                      If the Asset_Name, Asset_Code, Part_Master, Part_Checklist, and Action already
                      exist in the database, that row will be <span className="font-semibold">overwritten</span>.
                    </li>
                    <li>Make sure the data you import is all correct.</li>
                    <li>This process can't be canceled once submitted.</li>
                  </ul>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-3">
                  <Button size="sm" variant="outline" onClick={handleDownloadTemplate}>
                    Download Template CSV
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setIsImportModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setIsImportModalOpen(false);
                      fileInputRef.current?.click();
                    }}
                  >
                    Choose File & Upload
                  </Button>
                </div>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="py-6 text-sm text-gray-500">Loading parameters...</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800/60">
                  <tr>
                    {["Asset_Name", "Asset_Code", "Part_Master", "Part_Checklist", "Action", "Standard", "Actions"].map((header) => (
                      <th key={header} className="border-b border-gray-200 px-3 py-3 text-xs font-semibold uppercase text-gray-600 dark:border-gray-700 dark:text-gray-300">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                  {paginatedRows.map((row) => (
                    <tr key={row.id}>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{row.machineName}</td>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{row.machineAsset}</td>
                      {editingId === row.id ? (
                        <>
                          <td className="px-3 py-2"><input value={editRow.part_master} onChange={(e) => setEditRow((p) => ({ ...p, part_master: e.target.value }))} className={inputClass} /></td>
                          <td className="px-3 py-2"><input value={editRow.part_checklist} onChange={(e) => setEditRow((p) => ({ ...p, part_checklist: e.target.value }))} className={inputClass} /></td>
                          <td className="px-3 py-2"><input value={editRow.action} onChange={(e) => setEditRow((p) => ({ ...p, action: e.target.value }))} className={inputClass} /></td>
                          <td className="px-3 py-2"><input value={editRow.standard} onChange={(e) => setEditRow((p) => ({ ...p, standard: e.target.value }))} className={inputClass} /></td>
                          <td className="px-3 py-2">
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => void saveEdit(row.id)}>Save</Button>
                              <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{row.part_master}</td>
                          <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{row.part_checklist}</td>
                          <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{row.action || "-"}</td>
                          <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{row.standard || "-"}</td>
                          <td className="px-3 py-2">
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" onClick={() => startEdit(row)}>Edit</Button>
                              <Button size="sm" variant="outline" onClick={() => void handleDelete(row.id)} className="border-red-300 text-red-600 hover:bg-red-50">
                                Delete
                              </Button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                  {!filteredRows.length && (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-gray-400">
                        No parameters found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {!isLoading && filteredRows.length > 0 && (
            <div className="mt-4 flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
              <span>
                Page {currentPage + 1} of {totalPages} · {filteredRows.length} parameter(s)
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={currentPage === 0}>
                  Prev Page
                </Button>
                <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={currentPage >= totalPages - 1}>
                  Next Page
                </Button>
              </div>
            </div>
          )}
        </ComponentCard>
      </div>
    </>
  );
}
