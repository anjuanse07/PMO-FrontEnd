export type MachineSub = "MTC" | "UTY" | "BLD";
export type PreventiveType = string;
export type MaintenanceStatus = "In Progress" | "Approval" | "Completed";

export type MaintenanceOrder = {
  id: string;
  machineId: string;
  machineAsset?: string;
  machineName: string;
  location?: string | null;
  department: string;
  sub: MachineSub;
  preventiveDate: string;
  status: MaintenanceStatus;
  technician: string;
  year: number;
  month: number;
  week?: number;
  machineType: string;
};

export type MachineCatalogItem = {
  machineId: string;
  machineName: string;
  department: string;
  preventiveTypes: PreventiveType[];
};

export type PlannedPreventive = {
  id: string;
  sub: MachineSub;
  machineId: string;
  machineAsset?: string;
  machineName: string;
  department: string;
  location?: string | null;
  year: number;
  month: number;
  week: number;
  scheduledDate: string;
  preventiveTypes: PreventiveType[];
  status: "Draft" | "Approved by Engineering" | "Approved by Manager";
  approvedByEngineeringUser?: string | null;
  approvedByManagerUser?: string | null;
};

export const defaultMachineTypeOptions: Record<MachineSub, PreventiveType[]> = {
  MTC: ["CD", "CDC", "CF", "CV", "GB", "GBL", "GF", "GO", "GT", "S", "IH"],
  UTY: [
    "S",
    "C",
    "CF",
    "GO",
    "GF",
    "GL",
    "CR",
    "IH",
    "GFT",
    "GFKA",
    "CSA",
    "GPH",
    "GLT",
    "GES",
    "GFA",
    "GFV",
    "GFS",
    "GFST",
    "GMO",
    "GFKB",
    "GFKE",
    "GF5",
    "GF3",
  ],
  BLD: ["S"],
};

export let machineTypeOptions: Record<MachineSub, PreventiveType[]> = defaultMachineTypeOptions;

export function buildMachineTypeOptions(
  preventiveTypes: Array<{ abbreviation: string; parameter?: string }>
): Record<MachineSub, PreventiveType[]> {
  const allAbbreviations = preventiveTypes.map((t) => t.abbreviation);
  return {
    MTC: allAbbreviations,
    UTY: allAbbreviations,
    BLD: allAbbreviations,
  };
}

export function updateMachineTypeOptions(
  preventiveTypes: Array<{ abbreviation: string; parameter?: string }>
): void {
  machineTypeOptions = buildMachineTypeOptions(preventiveTypes);
}

export const machineCatalog: Record<MachineSub, MachineCatalogItem[]> = {
  MTC: [
    {
      machineId: "MTC-101",
      machineName: "CNC Machine A1",
      department: "Machine Shop",
      preventiveTypes: ["S", "GF"],
    },
    {
      machineId: "MTC-202",
      machineName: "Lathe B2",
      department: "Mechanical Workshop",
      preventiveTypes: ["GO", "GT"],
    },
    {
      machineId: "MTC-303",
      machineName: "Press C3",
      department: "Fabrication Bay",
      preventiveTypes: ["GF", "GFS"],
    },
  ],
  UTY: [
    {
      machineId: "UTY-110",
      machineName: "Boiler 1",
      department: "Utility Plant",
      preventiveTypes: ["GF", "GFS"],
    },
    {
      machineId: "UTY-220",
      machineName: "Air Compressor A",
      department: "Production Line 2",
      preventiveTypes: ["S", "GO"],
    },
    {
      machineId: "UTY-330",
      machineName: "Water Pump 2",
      department: "Utility Plant",
      preventiveTypes: ["GO", "GT"],
    },
  ],
  BLD: [
    {
      machineId: "BLD-401",
      machineName: "HVAC Unit 4",
      department: "Building Services",
      preventiveTypes: ["S", "GF"],
    },
    {
      machineId: "BLD-502",
      machineName: "Cooling Tower 3",
      department: "Maintenance Bay",
      preventiveTypes: ["GT", "GFS"],
    },
    {
      machineId: "BLD-603",
      machineName: "Chiller Room 2",
      department: "Building Systems",
      preventiveTypes: ["S"],
    },
  ],
};

export const defaultMaintenanceOrders: MaintenanceOrder[] = [
  {
    id: "PM-2026-001",
    machineId: "UTY-110",
    machineName: "Boiler 1",
    department: "Utility Plant",
    sub: "UTY",
    preventiveDate: "2026-01-12",
    status: "Approval",
    technician: "John Smith",
    year: 2026,
    month: 0,
    machineType: "GF",
  },
  {
    id: "PM-2026-002",
    machineId: "UTY-220",
    machineName: "Air Compressor A",
    department: "Production Line 2",
    sub: "UTY",
    preventiveDate: "2026-03-15",
    status: "In Progress",
    technician: "Mary Johnson",
    year: 2026,
    month: 2,
    machineType: "S",
  },
  {
    id: "PM-2026-003",
    machineId: "BLD-502",
    machineName: "Cooling Tower 3",
    department: "Maintenance Bay",
    sub: "BLD",
    preventiveDate: "2026-05-20",
    status: "Completed",
    technician: "David Lee",
    year: 2026,
    month: 4,
    machineType: "GT",
  },
  {
    id: "PM-2025-010",
    machineId: "MTC-101",
    machineName: "CNC Machine A1",
    department: "Machine Shop",
    sub: "MTC",
    preventiveDate: "2025-11-18",
    status: "Approval",
    technician: "Sarah Green",
    year: 2025,
    month: 10,
    machineType: "GFS",
  },
  {
    id: "PM-2025-011",
    machineId: "UTY-330",
    machineName: "Water Pump 2",
    department: "Utility Plant",
    sub: "UTY",
    preventiveDate: "2025-08-06",
    status: "In Progress",
    technician: "Ali Karim",
    year: 2025,
    month: 7,
    machineType: "GO",
  },
];

const APPROVED_KEY = "pmo-approved-orders";
const SCHEDULE_KEY = "pmo-scheduled-plans";

export const readApprovedOrders = (): MaintenanceOrder[] => {
  try {
    const data = localStorage.getItem(APPROVED_KEY);
    if (!data) return [];
    const parsed = JSON.parse(data) as MaintenanceOrder[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const writeApprovedOrders = (orders: MaintenanceOrder[]) => {
  localStorage.setItem(APPROVED_KEY, JSON.stringify(orders));
};

export const readScheduledPlans = (): PlannedPreventive[] => {
  try {
    const data = localStorage.getItem(SCHEDULE_KEY);
    if (!data) return [];
    const parsed = JSON.parse(data) as PlannedPreventive[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const writeScheduledPlans = (plans: PlannedPreventive[]) => {
  localStorage.setItem(SCHEDULE_KEY, JSON.stringify(plans));
};

export const getAllMaintenanceOrders = (): MaintenanceOrder[] => {
  const approved = readApprovedOrders();
  return [...defaultMaintenanceOrders, ...approved];
};
