import { useEffect, useState } from "react";
import {
  fetchSchedules,
  fetchApprovedOrders,
  type ScheduleRecord,
  type ApprovedOrderRecord,
} from "../services/pmoApi";

// Treat data younger than this as fresh enough to reuse without refetching.
// Short enough that stale data isn't a real problem, long enough that
// several components mounting within the same page load (e.g. every widget
// on the Dashboard) share one network request instead of firing N of them.
const CACHE_TTL_MS = 30_000;

type CacheEntry<T> = {
  data: T | null;
  error: Error | null;
  isLoading: boolean;
  promise: Promise<T> | null;
  fetchedAt: number;
  subscribers: Set<() => void>;
};

function createResourceCache<T>(fetcher: (key: string) => Promise<T>) {
  const entries = new Map<string, CacheEntry<T>>();

  function getEntry(key: string): CacheEntry<T> {
    let entry = entries.get(key);
    if (!entry) {
      entry = { data: null, error: null, isLoading: false, promise: null, fetchedAt: 0, subscribers: new Set() };
      entries.set(key, entry);
    }
    return entry;
  }

  function notify(entry: CacheEntry<T>) {
    entry.subscribers.forEach((callback) => callback());
  }

  function load(key: string, force = false): Promise<T> {
    const entry = getEntry(key);
    const isFresh = Date.now() - entry.fetchedAt < CACHE_TTL_MS;

    if (!force && entry.data !== null && isFresh) {
      return Promise.resolve(entry.data);
    }
    if (entry.promise && !force) {
      return entry.promise;
    }

    entry.isLoading = true;
    notify(entry);

    entry.promise = fetcher(key)
      .then((data) => {
        entry.data = data;
        entry.error = null;
        entry.fetchedAt = Date.now();
        return data;
      })
      .catch((error: unknown) => {
        entry.error = error instanceof Error ? error : new Error(String(error));
        throw entry.error;
      })
      .finally(() => {
        entry.isLoading = false;
        entry.promise = null;
        notify(entry);
      });

    return entry.promise;
  }

  function useResource(key: string) {
    const entry = getEntry(key);
    const [, forceRender] = useState(0);

    useEffect(() => {
      const callback = () => forceRender((v) => v + 1);
      entry.subscribers.add(callback);
      load(key).catch(() => {
        /* surfaced via entry.error, already triggers a re-render via notify() */
      });
      return () => {
        entry.subscribers.delete(callback);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    return {
      data: entry.data,
      // Only show a loading state on the very first fetch for this key -
      // a background refresh of already-cached data shouldn't blank the UI.
      isLoading: entry.isLoading && entry.data === null,
      error: entry.error,
      refetch: () => load(key, true),
    };
  }

  return {
    useResource,
    invalidate: (key: string) => entries.delete(key),
    invalidateAll: () => entries.clear(),
  };
}

const schedulesCache = createResourceCache<ScheduleRecord[]>((key) =>
  fetchSchedules(key === "all" ? undefined : Number(key)),
);
const ordersCache = createResourceCache<ApprovedOrderRecord[]>((key) =>
  fetchApprovedOrders(key === "all" ? undefined : Number(key)),
);

function yearKey(year: number | "All" | undefined): string {
  return year === undefined || year === "All" ? "all" : String(year);
}

/**
 * Cached, shared preventive_schedule data for a given year (or "All"/omit
 * for every year). Multiple components calling this with the same year
 * share one underlying fetch instead of each firing their own.
 */
export function useSchedules(year?: number | "All") {
  const result = schedulesCache.useResource(yearKey(year));
  return {
    schedules: result.data ?? [],
    isLoadingSchedules: result.isLoading,
    schedulesError: result.error,
    refetchSchedules: result.refetch,
  };
}

/** Same idea as useSchedules(), for maintenance_orders. */
export function useApprovedOrders(year?: number | "All") {
  const result = ordersCache.useResource(yearKey(year));
  return {
    orders: result.data ?? [],
    isLoadingOrders: result.isLoading,
    ordersError: result.error,
    refetchOrders: result.refetch,
  };
}

/**
 * Call after any mutation that creates/updates/deletes a schedule or order
 * (saving a new plan, approving a stage, saving a checklist, etc.) so every
 * component reading this cache - not just the one that made the change -
 * picks up fresh data on its next render instead of waiting out the TTL.
 */
export function invalidateScheduleData() {
  schedulesCache.invalidateAll();
  ordersCache.invalidateAll();
}
