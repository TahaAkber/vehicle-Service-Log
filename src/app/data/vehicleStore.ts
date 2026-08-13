import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  createElement,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

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

const todayAtNoon = (daysAgo = 0) => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString();
};

const defaultVehicle: Vehicle = {
  id: "yamaha-ybz-125dx",
  name: "Yamaha YBZ 125DX",
  odometer: 15420,
  dailyCommute: 20,
  oilType: "Semi-synthetic",
  oilCategory: "semi-synthetic",
  oilBrand: "",
  oilViscosity: "20W-40",
  oilInterval: 1000,
  oilTimeIntervalMonths: 3,
  oilLastChanged: 15270,
  oilLastChangedAt: todayAtNoon(19),
  ridingCondition: "normal",
  chainInterval: 300,
  chainLastServiced: 15240,
  logs: [
    {
      id: "demo-fuel",
      type: "fuel",
      title: "Refueled 6.2 liters",
      date: todayAtNoon(3),
      odometer: 15365,
      liters: 6.2,
      amount: 1600,
      unitPrice: 258.06,
      fullTank: false,
      source: "manual",
    },
    {
      id: "demo-oil",
      type: "oil",
      title: "Engine oil changed",
      date: todayAtNoon(19),
      odometer: 15270,
      note: "Semi-synthetic oil",
      oilCategory: "semi-synthetic",
      oilViscosity: "20W-40",
      oilInterval: 1000,
      oilTimeIntervalMonths: 3,
      ridingCondition: "normal",
    },
    {
      id: "demo-chain",
      type: "chain",
      title: "Chain lubed & cleaned",
      date: todayAtNoon(32),
      odometer: 15240,
    },
  ],
};

export const defaultGarage: Garage = {
  activeVehicleId: defaultVehicle.id,
  vehicles: [defaultVehicle],
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
    ...defaultVehicle,
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

function useVehicleStoreState() {
  const [garage, setGarage] = useState<Garage>(defaultGarage);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!active || !stored) return;
        const parsed = JSON.parse(stored) as Garage;
        if (parsed.vehicles?.length && parsed.activeVehicleId) {
          setGarage({
            ...parsed,
            vehicles: parsed.vehicles.map((vehicle) => normalizeVehicle(vehicle)),
          });
        }
      })
      .catch((error) => console.warn("Could not load garage", error))
      .finally(() => active && setIsLoading(false));

    return () => {
      active = false;
    };
  }, []);

  const saveGarage = (updater: Garage | ((current: Garage) => Garage)) => {
    setGarage((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch((error) =>
        console.warn("Could not save garage", error),
      );
      return next;
    });
  };

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
