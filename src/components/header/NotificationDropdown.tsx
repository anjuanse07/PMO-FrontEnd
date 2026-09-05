import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { DropdownItem } from "../ui/dropdown/DropdownItem";
import { getCurrentUser, canViewLogs } from "../../auth/auth";
import {
  fetchNotifications,
  type NotificationsResponse,
  type NotificationActivityItem,
} from "../../services/pmoApi";

// How often to re-poll for new notifications while the app is open.
const POLL_INTERVAL_MS = 60_000;

// "Last seen activity id" is tracked per-user in localStorage, the same
// pattern auth.ts already uses for pmo_current_user - no backend column
// needed. Only the "activity" feed uses this; "pending" items (things
// still needing action) always show regardless of whether they've been
// seen, since they represent live backlog, not a one-time event to
// dismiss.
function lastSeenKey(userId: number) {
  return `pmo_notifications_last_seen_${userId}`;
}

function getLastSeenId(userId: number): number {
  const raw = localStorage.getItem(lastSeenKey(userId));
  return raw ? Number(raw) || 0 : 0;
}

function setLastSeenId(userId: number, id: number) {
  localStorage.setItem(lastSeenKey(userId), String(id));
}

function timeAgo(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return date.toLocaleDateString();
}

export default function NotificationDropdown() {
  const navigate = useNavigate();
  const currentUser = getCurrentUser();

  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState<NotificationsResponse>({ pending: [], activity: [] });
  const [unreadActivityCount, setUnreadActivityCount] = useState(0);

  function toggleDropdown() {
    setIsOpen((prev) => !prev);
  }

  function closeDropdown() {
    setIsOpen(false);
  }

  const loadNotifications = async () => {
    if (!currentUser) return;
    try {
      const result = await fetchNotifications(currentUser.id, currentUser.role, currentUser.name);
      setData(result);
      const lastSeen = getLastSeenId(currentUser.id);
      setUnreadActivityCount(result.activity.filter((item) => item.id > lastSeen).length);
    } catch (error) {
      console.error("Failed to load notifications:", error);
    }
  };

  useEffect(() => {
    void loadNotifications();
    const interval = setInterval(() => void loadNotifications(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  const handleClick = () => {
    toggleDropdown();
    // Opening the dropdown marks the activity feed (not pending items) as
    // seen - pending items only clear once actually resolved.
    if (!isOpen && currentUser && data.activity.length > 0) {
      const maxId = Math.max(...data.activity.map((item) => item.id));
      setLastSeenId(currentUser.id, maxId);
      setUnreadActivityCount(0);
    }
  };

  const handlePendingClick = (link: string) => {
    closeDropdown();
    navigate(link);
  };

  const handleActivityClick = (item: NotificationActivityItem) => {
    closeDropdown();
    if (item.link) navigate(item.link);
  };

  const notifying = data.pending.length > 0 || unreadActivityCount > 0;
  const totalBadgeCount = data.pending.length + unreadActivityCount;

  return (
    <div className="relative">
      <button
        className="relative flex items-center justify-center text-gray-500 transition-colors bg-white border border-gray-200 rounded-full dropdown-toggle hover:text-gray-700 h-11 w-11 hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
        onClick={handleClick}
      >
        {notifying && (
          <span className="absolute -right-1 -top-1 z-10 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-semibold leading-none text-white">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75"></span>
            <span className="relative">{totalBadgeCount > 9 ? "9+" : totalBadgeCount}</span>
          </span>
        )}
        <svg
          className="fill-current"
          width="20"
          height="20"
          viewBox="0 0 20 20"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M10.75 2.29248C10.75 1.87827 10.4143 1.54248 10 1.54248C9.58583 1.54248 9.25004 1.87827 9.25004 2.29248V2.83613C6.08266 3.20733 3.62504 5.9004 3.62504 9.16748V14.4591H3.33337C2.91916 14.4591 2.58337 14.7949 2.58337 15.2091C2.58337 15.6234 2.91916 15.9591 3.33337 15.9591H4.37504H15.625H16.6667C17.0809 15.9591 17.4167 15.6234 17.4167 15.2091C17.4167 14.7949 17.0809 14.4591 16.6667 14.4591H16.375V9.16748C16.375 5.9004 13.9174 3.20733 10.75 2.83613V2.29248ZM14.875 14.4591V9.16748C14.875 6.47509 12.6924 4.29248 10 4.29248C7.30765 4.29248 5.12504 6.47509 5.12504 9.16748V14.4591H14.875ZM8.00004 17.7085C8.00004 18.1228 8.33583 18.4585 8.75004 18.4585H11.25C11.6643 18.4585 12 18.1228 12 17.7085C12 17.2943 11.6643 16.9585 11.25 16.9585H8.75004C8.33583 16.9585 8.00004 17.2943 8.00004 17.7085Z"
            fill="currentColor"
          />
        </svg>
      </button>
      <Dropdown
        isOpen={isOpen}
        onClose={closeDropdown}
        className="absolute -right-[240px] mt-[17px] flex h-[480px] w-[350px] flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark sm:w-[361px] lg:right-0"
      >
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-100 dark:border-gray-700">
          <h5 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
            Notification
          </h5>
          <button
            onClick={toggleDropdown}
            className="text-gray-500 transition dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            <svg
              className="fill-current"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M6.21967 7.28131C5.92678 6.98841 5.92678 6.51354 6.21967 6.22065C6.51256 5.92775 6.98744 5.92775 7.28033 6.22065L11.999 10.9393L16.7176 6.22078C17.0105 5.92789 17.4854 5.92788 17.7782 6.22078C18.0711 6.51367 18.0711 6.98855 17.7782 7.28144L13.0597 12L17.7782 16.7186C18.0711 17.0115 18.0711 17.4863 17.7782 17.7792C17.4854 18.0721 17.0105 18.0721 16.7176 17.7792L11.999 13.0607L7.28033 17.7794C6.98744 18.0722 6.51256 18.0722 6.21967 17.7794C5.92678 17.4865 5.92678 17.0116 6.21967 16.7187L10.9384 12L6.21967 7.28131Z"
                fill="currentColor"
              />
            </svg>
          </button>
        </div>

        <ul className="flex flex-col h-auto overflow-y-auto custom-scrollbar">
          {data.pending.length === 0 && data.activity.length === 0 && (
            <li className="px-3 py-10 text-center text-sm text-gray-400 dark:text-gray-500">
              You're all caught up!
            </li>
          )}

          {data.pending.length > 0 && (
            <>
              <li className="px-1 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                Needs Your Action
              </li>
              {data.pending.map((item) => (
                <li key={item.id}>
                  <DropdownItem
                    onItemClick={() => handlePendingClick(item.link)}
                    className={`flex items-start gap-3 rounded-lg border-b p-3 px-4.5 py-3 hover:bg-gray-100 dark:hover:bg-white/5 ${
                      item.severity === "error"
                        ? "border-red-100 bg-red-50/60 dark:border-red-900/30 dark:bg-red-500/5"
                        : "border-amber-100 bg-amber-50/60 dark:border-amber-900/30 dark:bg-amber-500/5"
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm ${
                        item.severity === "error"
                          ? "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400"
                          : "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400"
                      }`}
                    >
                      ⏳
                    </span>
                    <span className="block text-theme-sm font-medium text-gray-800 dark:text-white/90">
                      {item.title}
                    </span>
                  </DropdownItem>
                </li>
              ))}
            </>
          )}

          {data.activity.length > 0 && (
            <>
              <li className="px-1 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                Recent Activity
              </li>
              {data.activity.map((item) => (
                <li key={item.id}>
                  <DropdownItem
                    onItemClick={() => handleActivityClick(item)}
                    className="flex gap-3 rounded-lg border-b border-gray-100 p-3 px-4.5 py-3 hover:bg-gray-100 dark:border-gray-800 dark:hover:bg-white/5"
                  >
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                      🛠️
                    </span>
                    <span className="block">
                      <span className="mb-1 block text-theme-sm text-gray-600 dark:text-gray-300">
                        {item.title}
                      </span>
                      <span className="flex items-center gap-2 text-gray-400 text-theme-xs dark:text-gray-500">
                        {item.userName && (
                          <>
                            <span>{item.userName}</span>
                            <span className="h-1 w-1 rounded-full bg-gray-300 dark:bg-gray-600" />
                          </>
                        )}
                        <span>{timeAgo(item.createdAt)}</span>
                      </span>
                    </span>
                  </DropdownItem>
                </li>
              ))}
            </>
          )}
        </ul>

        <Link
          to={canViewLogs(currentUser) ? "/history-logs" : "/PreventiveMaintenanceOrder"}
          onClick={closeDropdown}
          className="block px-4 py-2 mt-3 text-sm font-medium text-center text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
        >
          {canViewLogs(currentUser) ? "View All Activity" : "View Preventive Orders"}
        </Link>
      </Dropdown>
    </div>
  );
}
