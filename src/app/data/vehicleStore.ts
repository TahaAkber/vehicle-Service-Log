import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo, useState } from "react";

export type LogType = "oil" | "chain" | "fuel" | "service" | "odometer";

export type ServiceLog = {
  id: string;
  type: LogType;
  title: string;
  date: string;
  odometer: number;
  note?: string;
  liters?: number;
};

export type Vehicle = {
  id: string;
  name: string;
  odometer: number;
  dailyCommute: number;
  oilType: string;
  oilInterval: number;
  oilLastChanged: number;
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
  "name" | "odometer" | "dailyCommute" | "oilType" | "oilInterval" | "chainInterval"
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
  oilInterval: 500,
  oilLastChanged: 15270,
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
    },
    {
      id: "demo-oil",
      type: "oil",
      title: "Engine oil changed",
      date: todayAtNoon(19),
      odometer: 15270,
      note: "Semi-synthetic oil",
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
  oilLastChanged: input.odometer,
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

export const getHealth = (odometer: number, lastService: number, interval: number) => {
  const used = Math.max(0, odometer - lastService);
  const remaining = Math.max(0, interval - used);
  const percent = Math.max(0, Math.min(100, Math.round((remaining / interval) * 100)));
  return { percent, remaining, overdue: used > interval };
};

export function useVehicleStore() {
  const [garage, setGarage] = useState<Garage>(defaultGarage);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!active || !stored) return;
        const parsed = JSON.parse(stored) as Garage;
        if (parsed.vehicles?.length && parsed.activeVehicleId) setGarage(parsed);
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
