import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import {
  useCallback,
  createContext,
  createElement,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { supabase } from "../../lib/supabase";
import { useAuth } from "../../providers/AuthProvider";

export type LogType = "oil" | "chain" | "fuel" | "service" | "odometer";
export type OilCategory = "mineral" | "semi-synthetic" | "fully-synthetic" | "other";
export type RidingCondition = "normal" | "heavy-traffic" | "dusty" | "long-distance";

export type ServiceLog = {
  id: string;
  type: LogType;
  title: string;
  date: string;
  odometer: number;
  note?: string;
  liters?: number;
  amount?: number;
  unitPrice?: number;
  fullTank?: boolean;
  source?: "camera" | "gallery" | "manual";
  oilCategory?: OilCategory;
  oilBrand?: string;
  oilViscosity?: string;
  oilInterval?: number;
  oilTimeIntervalMonths?: number;
  ridingCondition?: RidingCondition;
};

export type Vehicle = {
  id: string;
  name: string;
  odometer: number;
  dailyCommute: number;
  oilType: string;
  oilCategory: OilCategory;
  oilBrand: string;
  oilViscosity: string;
  oilInterval: number;
  oilTimeIntervalMonths: number;
  oilLastChanged: number;
  oilLastChangedAt: string;
  ridingCondition: RidingCondition;
  chainInterval: number;
  chainLastServiced: number;
  logs: ServiceLog[];
};

export type Garage = {
  activeVehicleId: string;
  vehicles: Vehicle[];
};

export type VehicleInput = Pick<
  Vehicle,
  | "name"
  | "odometer"
  | "dailyCommute"
  | "oilType"
  | "oilCategory"
  | "oilBrand"
  | "oilViscosity"
  | "oilInterval"
  | "oilTimeIntervalMonths"
  | "oilLastChanged"
  | "oilLastChangedAt"
  | "ridingCondition"
  | "chainInterval"
>;

const STORAGE_KEY = "vehicle-service-log/garage-v1";
const USER_STORAGE_PREFIX = "vehicle-service-log/user-garage-v2";

export type SyncStatus = "offline" | "syncing" | "synced" | "pending" | "error";

type GarageCache = {
  garage: Garage;
  updatedAt: string;
  dirty: boolean;
  lastSyncedAt?: string;
};

type RemoteGarage = {
  garage: Garage;
  client_updated_at: string;
  updated_at: string;
};

const vehicleDefaults: Omit<Vehicle, "id" | "name" | "odometer"> = {
  dailyCommute: 20,
  oilType: "Semi-synthetic",
  oilCategory: "semi-synthetic",
  oilBrand: "",
  oilViscosity: "20W-40",
  oilInterval: 1000,
  oilTimeIntervalMonths: 3,
  oilLastChanged: 0,
  oilLastChangedAt: new Date().toISOString(),
  ridingCondition: "normal",
  chainInterval: 500,
  chainLastServiced: 0,
  logs: [],
};

export const defaultGarage: Garage = {
  activeVehicleId: "",
  vehicles: [],
};

const createId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export const createVehicle = (input: VehicleInput): Vehicle => ({
  id: createId("vehicle"),
  ...input,
  chainLastServiced: input.odometer,
  logs: [
    {
      id: createId("log"),
      type: "odometer",
      title: "Vehicle added",
      date: new Date().toISOString(),
      odometer: input.odometer,
    },
  ],
});

export const createLogId = () => createId("log");

export const sortLogsNewest = (logs: ServiceLog[]) =>
  [...logs].sort((a, b) => {
    const aTime = new Date(a.date).getTime();
    const bTime = new Date(b.date).getTime();
    return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
  });

export const getHealth = (odometer: number, lastService: number, interval: number) => {
  const used = Math.max(0, odometer - lastService);
  const remaining = Math.max(0, interval - used);
  const percent = Math.max(0, Math.min(100, Math.round((remaining / interval) * 100)));
  return { percent, remaining, overdue: used >= interval };
};

export const oilCategoryLabel = (category: OilCategory) =>
  ({
    mineral: "Mineral",
    "semi-synthetic": "Semi-synthetic",
    "fully-synthetic": "Fully synthetic",
    other: "Other",
  })[category];

export const ridingConditionLabel = (condition: RidingCondition) =>
  ({
    normal: "Normal",
    "heavy-traffic": "Heavy traffic",
    dusty: "Dusty roads",
    "long-distance": "Long distance",
  })[condition];

const addMonths = (isoDate: string, months: number) => {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return new Date();
  const originalDay = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  const lastDayOfTargetMonth = new Date(
    date.getFullYear(),
    date.getMonth() + 1,
    0,
  ).getDate();
  date.setDate(Math.min(originalDay, lastDayOfTargetMonth));
  return date;
};

export const getOilHealth = (vehicle: Vehicle, now = new Date()) => {
  const distance = getHealth(vehicle.odometer, vehicle.oilLastChanged, vehicle.oilInterval);
  const changedAt = new Date(vehicle.oilLastChangedAt);
  const safeChangedAt = Number.isNaN(changedAt.getTime()) ? now : changedAt;
  const deadline = addMonths(safeChangedAt.toISOString(), vehicle.oilTimeIntervalMonths);
  const totalTime = Math.max(1, deadline.getTime() - safeChangedAt.getTime());
  const timeRemaining = deadline.getTime() - now.getTime();
  const timePercent = Math.max(0, Math.min(100, Math.round((timeRemaining / totalTime) * 100)));
  const remainingDays = Math.max(0, Math.ceil(timeRemaining / 86_400_000));
  const limitingFactor = distance.percent <= timePercent ? "distance" : "time";

  return {
    percent: Math.min(distance.percent, timePercent),
    remaining: distance.remaining,
    remainingDays,
    dueDate: deadline.toISOString(),
    overdue: distance.remaining === 0 || timeRemaining <= 0,
    limitingFactor,
    distancePercent: distance.percent,
    timePercent,
  } as const;
};

const inferOilCategory = (oilType?: string): OilCategory => {
  const normalized = oilType?.toLowerCase() ?? "";
  if (normalized.includes("semi")) return "semi-synthetic";
  if (normalized.includes("full") || normalized.includes("synthetic")) return "fully-synthetic";
  if (normalized.includes("mineral")) return "mineral";
  return "other";
};

const normalizeVehicle = (vehicle: Partial<Vehicle> & Pick<Vehicle, "id" | "name" | "odometer">): Vehicle => {
  const logs = sortLogsNewest(Array.isArray(vehicle.logs) ? vehicle.logs : []);
  const latestOilLog = logs.find((log) => log.type === "oil");
  const category = vehicle.oilCategory ?? inferOilCategory(vehicle.oilType);
  const oilDateCandidate = vehicle.oilLastChangedAt ?? latestOilLog?.date;
  const oilDate = oilDateCandidate ? new Date(oilDateCandidate) : new Date();
  const oilLastChangedAt = Number.isNaN(oilDate.getTime())
    ? new Date().toISOString()
    : oilDate.toISOString();
  return {
    ...vehicleDefaults,
    ...vehicle,
    logs,
    oilCategory: category,
    oilType: vehicle.oilType ?? oilCategoryLabel(category),
    oilBrand: vehicle.oilBrand ?? "",
    oilViscosity: vehicle.oilViscosity ?? "",
    oilInterval: vehicle.oilInterval && vehicle.oilInterval > 0 ? vehicle.oilInterval : 1000,
    oilTimeIntervalMonths:
      vehicle.oilTimeIntervalMonths && vehicle.oilTimeIntervalMonths > 0
        ? vehicle.oilTimeIntervalMonths
        : 3,
    oilLastChangedAt,
    ridingCondition: vehicle.ridingCondition ?? "normal",
  };
};

const isUntouchedDemoVehicle = (vehicle: Vehicle) =>
  vehicle.id === "yamaha-ybz-125dx" &&
  vehicle.logs.length > 0 &&
  vehicle.logs.every((log) => ["demo-fuel", "demo-oil", "demo-chain"].includes(log.id));

const normalizeGarage = (garage: Garage): Garage => {
  const vehicles = garage.vehicles
    .map((vehicle) => normalizeVehicle(vehicle))
    .filter((vehicle) => !isUntouchedDemoVehicle(vehicle));
  return {
    activeVehicleId: vehicles.some((vehicle) => vehicle.id === garage.activeVehicleId)
      ? garage.activeVehicleId
      : (vehicles[0]?.id ?? ""),
    vehicles,
  };
};

const parseCache = (stored: string | null): GarageCache | null => {
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored) as Partial<GarageCache> & Partial<Garage>;
    if (parsed.garage && Array.isArray(parsed.garage.vehicles)) {
      return {
        garage: normalizeGarage(parsed.garage),
        updatedAt: parsed.updatedAt ?? new Date(0).toISOString(),
        dirty: Boolean(parsed.dirty),
        lastSyncedAt: parsed.lastSyncedAt,
      };
    }
    if (Array.isArray(parsed.vehicles) && typeof parsed.activeVehicleId === "string") {
      return {
        garage: normalizeGarage(parsed as Garage),
        updatedAt: new Date().toISOString(),
        dirty: true,
      };
    }
  } catch (error) {
    console.warn("Could not parse local garage", error);
  }
  return null;
};

const asRemoteGarage = (value: unknown): RemoteGarage | null => {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return null;
  const candidate = row as Partial<RemoteGarage>;
  if (!candidate.garage || !Array.isArray(candidate.garage.vehicles) || !candidate.client_updated_at || !candidate.updated_at) {
    return null;
  }
  return candidate as RemoteGarage;
};

function useVehicleStoreState() {
  const { user } = useAuth();
  const userId = user?.id;
  const [garage, setGarage] = useState<Garage>(defaultGarage);
  const [isLoading, setIsLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("pending");
  const [isOnline, setIsOnline] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<string>();
  const cacheRef = useRef<GarageCache | undefined>(undefined);
  const syncingRef = useRef(false);
  const rerunSyncRef = useRef(false);
  const initializedRef = useRef(false);
  const storageKey = userId ? `${USER_STORAGE_PREFIX}/${userId}` : undefined;

  const persistCache = useCallback(async (cache: GarageCache) => {
    if (!storageKey) return;
    await AsyncStorage.setItem(storageKey, JSON.stringify(cache));
  }, [storageKey]);

  const applyCache = useCallback((cache: GarageCache) => {
    cacheRef.current = cache;
    setGarage(cache.garage);
    setLastSyncedAt(cache.lastSyncedAt);
    setSyncStatus(cache.dirty ? "pending" : "synced");
  }, []);

  const pullRemote = useCallback(async () => {
    if (!userId) return null;
    const { data, error } = await supabase
      .from("garages")
      .select("garage, client_updated_at, updated_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return asRemoteGarage(data);
  }, [userId]);

  const syncNow = useCallback(async () => {
    if (!userId || !storageKey || !initializedRef.current) return;
    if (syncingRef.current) {
      rerunSyncRef.current = true;
      return;
    }

    const network = await NetInfo.fetch();
    const online = Boolean(network.isConnected && network.isInternetReachable !== false);
    setIsOnline(online);
    if (!online) {
      setSyncStatus("offline");
      return;
    }

    syncingRef.current = true;
    setSyncStatus("syncing");
    try {
      const local = cacheRef.current;
      if (!local) return;

      let remote: RemoteGarage | null;
      if (local.dirty) {
        const { data, error } = await supabase.rpc("sync_garage", {
          p_garage: local.garage,
          p_client_updated_at: local.updatedAt,
        });
        if (error) throw error;
        remote = asRemoteGarage(data);
      } else {
        remote = await pullRemote();
      }

      const current = cacheRef.current;
      if (!current) return;
      const remoteTime = remote ? new Date(remote.client_updated_at).getTime() : 0;
      const localTime = new Date(current.updatedAt).getTime();
      if (current.updatedAt !== local.updatedAt && remoteTime <= localTime) {
        rerunSyncRef.current = true;
        setSyncStatus("pending");
        await persistCache(current);
        return;
      }
      const syncedAt = new Date().toISOString();
      const next: GarageCache = remote && remoteTime > localTime
        ? {
            garage: normalizeGarage(remote.garage),
            updatedAt: remote.client_updated_at,
            dirty: false,
            lastSyncedAt: syncedAt,
          }
        : { ...current, dirty: false, lastSyncedAt: syncedAt };
      applyCache(next);
      await persistCache(next);
    } catch (error) {
      console.warn("Garage sync failed", error);
      setSyncStatus("error");
    } finally {
      syncingRef.current = false;
      if (rerunSyncRef.current) {
        rerunSyncRef.current = false;
        void syncNow();
      }
    }
  }, [applyCache, persistCache, pullRemote, storageKey, userId]);

  useEffect(() => {
    let active = true;
    initializedRef.current = false;
    cacheRef.current = undefined;
    setIsLoading(true);

    const initialize = async () => {
      if (!storageKey || !userId) return;
      const [userStored, legacyStored, network] = await Promise.all([
        AsyncStorage.getItem(storageKey),
        AsyncStorage.getItem(STORAGE_KEY),
        NetInfo.fetch(),
      ]);
      if (!active) return;

      const userCache = parseCache(userStored);
      const legacyCache = parseCache(legacyStored);
      const usedLegacyCache = !userCache && Boolean(legacyCache);
      const online = Boolean(network.isConnected && network.isInternetReachable !== false);
      setIsOnline(online);

      let initial = userCache ?? legacyCache ?? {
        garage: defaultGarage,
        updatedAt: new Date().toISOString(),
        dirty: true,
      };

      if (!userCache && online) {
        try {
          const remote = await pullRemote();
          if (remote) {
            initial = {
              garage: normalizeGarage(remote.garage),
              updatedAt: remote.client_updated_at,
              dirty: false,
              lastSyncedAt: new Date().toISOString(),
            };
          }
        } catch (error) {
          console.warn("Initial cloud load failed", error);
        }
      }

      if (!active) return;
      applyCache(initial);
      await persistCache(initial);
      if (usedLegacyCache) await AsyncStorage.removeItem(STORAGE_KEY);
      initializedRef.current = true;
      setIsLoading(false);
      void syncNow();
    };

    initialize().catch((error) => {
      console.warn("Could not initialize garage", error);
      if (!active) return;
      const fallback: GarageCache = {
        garage: defaultGarage,
        updatedAt: new Date().toISOString(),
        dirty: true,
      };
      applyCache(fallback);
      initializedRef.current = true;
      setIsLoading(false);
      setSyncStatus("error");
    });

    return () => {
      active = false;
    };
  }, [applyCache, persistCache, pullRemote, storageKey, syncNow, userId]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      setIsOnline(online);
      if (online) void syncNow();
      else setSyncStatus("offline");
    });
    return unsubscribe;
  }, [syncNow]);

  const saveGarage = useCallback((updater: Garage | ((current: Garage) => Garage)) => {
    setGarage((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      const cache: GarageCache = {
        garage: next,
        updatedAt: new Date().toISOString(),
        dirty: true,
        lastSyncedAt: cacheRef.current?.lastSyncedAt,
      };
      cacheRef.current = cache;
      setSyncStatus(isOnline ? "pending" : "offline");
      persistCache(cache)
        .then(() => syncNow())
        .catch((error) => console.warn("Could not save garage", error));
      return next;
    });
  }, [isOnline, persistCache, syncNow]);

  const activeVehicle = useMemo(
    () => garage.vehicles.find((vehicle) => vehicle.id === garage.activeVehicleId) ?? garage.vehicles[0],
    [garage],
  );

  const selectVehicle = (id: string) =>
    saveGarage((current) => ({ ...current, activeVehicleId: id }));

  const addVehicle = (input: VehicleInput) => {
    const vehicle = createVehicle(input);
    saveGarage((current) => ({
      activeVehicleId: vehicle.id,
      vehicles: [...current.vehicles, vehicle],
    }));
  };

  const updateVehicle = (id: string, updater: (vehicle: Vehicle) => Vehicle) =>
    saveGarage((current) => ({
      ...current,
      vehicles: current.vehicles.map((vehicle) => (vehicle.id === id ? updater(vehicle) : vehicle)),
    }));

  const removeVehicle = (id: string) =>
    saveGarage((current) => {
      if (current.vehicles.length === 1) return current;
      const vehicles = current.vehicles.filter((vehicle) => vehicle.id !== id);
      return {
        vehicles,
        activeVehicleId:
          current.activeVehicleId === id ? vehicles[0].id : current.activeVehicleId,
      };
    });

  return {
    garage,
    activeVehicle,
    isLoading,
    selectVehicle,
    addVehicle,
    updateVehicle,
    removeVehicle,
    syncStatus,
    isOnline,
    pendingChanges: Boolean(cacheRef.current?.dirty),
    lastSyncedAt,
    retrySync: syncNow,
  };
}

type VehicleStoreValue = ReturnType<typeof useVehicleStoreState>;

const VehicleStoreContext = createContext<VehicleStoreValue | null>(null);

export function VehicleStoreProvider({ children }: { children: ReactNode }) {
  const store = useVehicleStoreState();
  return createElement(VehicleStoreContext.Provider, { value: store }, children);
}

export function useVehicleStore() {
  const store = useContext(VehicleStoreContext);
  if (!store) {
    throw new Error("useVehicleStore must be used inside VehicleStoreProvider");
  }
  return store;
}
