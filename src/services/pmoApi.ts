// This file re-exports everything from services/api/* so every existing
// `import { X } from "../services/pmoApi"` across the app keeps working
// unchanged. New code should import directly from the specific domain
// module (e.g. "../services/api/schedulesApi") instead of this barrel.
export * from "./api/client";
export * from "./api/machinesApi";
export * from "./api/schedulesApi";
export * from "./api/ordersApi";
export * from "./api/authApi";
export * from "./api/auditApi";
export * from "./api/notificationsApi";
export * from "./api/historyApi";
