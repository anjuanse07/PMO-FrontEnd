export type AppRole =
  | "manager"
  | "engineering supervisor"
  | "engineering officer"
  | "technician";

export type AppUser = {
  id: number;
  nickname: string;
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  role: AppRole;
};

const USER_KEY = "pmo_current_user";

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) || "http://localhost:5000";

const normalizeRole = (value: string): AppRole => {
  const role = value.trim().toLowerCase();

  if (role === "manager" || role === "mgr") return "manager";
  if (role === "engineering supervisor" || role === "supervisor") return "engineering supervisor";
  if (role === "engineering officer" || role === "officer") return "engineering officer";
  if (role === "technician" || role === "tech") return "technician";

  return "technician";
};

export function getCurrentUser(): AppUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as AppUser;
    return parsed && parsed.id && parsed.nickname ? parsed : null;
  } catch {
    return null;
  }
}

export function setCurrentUser(user: AppUser | null): void {
  if (!user) {
    localStorage.removeItem(USER_KEY);
    return;
  }

  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export async function signInUser(
  nickname: string,
  password: string
): Promise<AppUser | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/users/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        nickname: nickname.trim(),
        password,
      }),
    });

    if (!response.ok) {
      if (response.status >= 500) {
        throw new Error("The login server could not process the request.");
      }
      return null;
    }

    const data = await response.json();

    if (!data?.user) {
      return null;
    }

    const user: AppUser = {
      id: Number(data.user.id),
      nickname: String(data.user.nickname),
      name: String(data.user.name),
      firstName: data.user.firstName ?? null,
      lastName: data.user.lastName ?? null,
      email: data.user.email ?? null,
      phone: data.user.phone ?? null,
      role: normalizeRole(String(data.user.role)),
    };

    setCurrentUser(user);
    return user;
  } catch (error) {
    console.error("Login failed:", error);
    throw error instanceof Error
      ? error
      : new Error("Unable to connect to the login server.");
  }
}

export function logoutUser(): void {
  setCurrentUser(null);
}

export function isManager(user: AppUser | null): boolean {
  return user?.role === "manager";
}

export function canApproveEngineering(user: AppUser | null): boolean {
  return (
    user?.role === "engineering supervisor" ||
    user?.role === "engineering officer"
  );
}

export function canScheduleYearlyPlan(user: AppUser | null): boolean {
  return Boolean(
    user &&
      ["manager", "engineering supervisor", "engineering officer"].includes(user.role)
  );
}

export function canFillPreventiveForm(user: AppUser | null): boolean {
  return Boolean(
    user &&
      ["technician", "manager", "engineering supervisor", "engineering officer"].includes(
        user.role
      )
  );
}

export function getRoleLabel(role: AppRole): string {
  switch (role) {
    case "manager":
      return "Manager";
    case "engineering supervisor":
      return "Engineering Supervisor";
    case "engineering officer":
      return "Engineering Officer";
    case "technician":
      return "Technician";
    default:
      return "User";
  }
}