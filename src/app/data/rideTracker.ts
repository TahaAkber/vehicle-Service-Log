import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";

export type VehicleKind = "bike" | "car";
export type CommuteDirection = "outbound" | "return" | "other";
export type CommuteZone = "home" | "work" | "other";

export type RoutePoint = {
  latitude: number;
  longitude: number;
  timestamp: number;
  accuracy?: number;
  speed?: number;
};

export type CommutePlace = {
  latitude: number;
  longitude: number;
  label: string;
};

export type CommuteTrip = {
  id: string;
  vehicleId: string;
  startedAt: string;
  endedAt: string;
  distanceKm: number;
  direction: CommuteDirection;
  route: RoutePoint[];
  source: "gps";
  odometerApplied?: boolean;
};

export type ActiveRide = {
  id: string;
  vehicleId: string;
  vehicleName: string;
  vehicleKind: VehicleKind;
  startedAt: string;
  startZone: CommuteZone;
  distanceKm: number;
  route: RoutePoint[];
  automatic: boolean;
  home?: CommutePlace;
  work?: CommutePlace;
};

type AutoTrackingConfig = {
  enabled: boolean;
  vehicleId: string;
  vehicleName: string;
  vehicleKind: VehicleKind;
  home: CommutePlace;
  work: CommutePlace;
};

type LocationTaskData = { locations?: Location.LocationObject[] };
type GeofenceTaskData = {
  eventType?: Location.GeofencingEventType;
  region?: Location.LocationRegion;
};

export const RIDE_LOCATION_TASK = "vehicle-service-log/ride-location-v1";
export const COMMUTE_GEOFENCE_TASK = "vehicle-service-log/commute-geofence-v1";
const ACTIVE_RIDE_KEY = "vehicle-service-log/active-ride-v1";
const COMPLETED_RIDES_KEY = "vehicle-service-log/completed-rides-v1";
const AUTO_CONFIG_KEY = "vehicle-service-log/auto-tracking-v1";
const GEOFENCE_RADIUS_METERS = 140;

const createRideId = () =>
  `trip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const radians = (degrees: number) => (degrees * Math.PI) / 180;

export function distanceMeters(
  a: Pick<RoutePoint, "latitude" | "longitude">,
  b: Pick<RoutePoint, "latitude" | "longitude">,
) {
  const earthRadius = 6_371_000;
  const latitudeDelta = radians(b.latitude - a.latitude);
  const longitudeDelta = radians(b.longitude - a.longitude);
  const latitudeA = radians(a.latitude);
  const latitudeB = radians(b.latitude);
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitudeA) *
      Math.cos(latitudeB) *
      Math.sin(longitudeDelta / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

const zoneForPoint = (
  point: Pick<RoutePoint, "latitude" | "longitude"> | undefined,
  home?: CommutePlace,
  work?: CommutePlace,
): CommuteZone => {
  if (!point) return "other";
  if (home && distanceMeters(point, home) <= GEOFENCE_RADIUS_METERS * 1.5)
    return "home";
  if (work && distanceMeters(point, work) <= GEOFENCE_RADIUS_METERS * 1.5)
    return "work";
  return "other";
};

const directionForZones = (
  start: CommuteZone,
  end: CommuteZone,
): CommuteDirection => {
  if (start === "home" && end === "work") return "outbound";
  if (start === "work" && end === "home") return "return";
  return "other";
};

const toRoutePoint = (location: Location.LocationObject): RoutePoint => ({
  latitude: location.coords.latitude,
  longitude: location.coords.longitude,
  timestamp: location.timestamp,
  accuracy: location.coords.accuracy ?? undefined,
  speed: location.coords.speed ?? undefined,
});

const readJson = async <T>(key: string): Promise<T | null> => {
  const value = await AsyncStorage.getItem(key);
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

export const getActiveRide = () => readJson<ActiveRide>(ACTIVE_RIDE_KEY);

const saveActiveRide = (ride: ActiveRide) =>
  AsyncStorage.setItem(ACTIVE_RIDE_KEY, JSON.stringify(ride));

const appendLocations = async (locations: Location.LocationObject[]) => {
  const ride = await getActiveRide();
  if (!ride) return;

  let distanceKm = ride.distanceKm;
  const route = [...ride.route];
  for (const location of locations.sort((a, b) => a.timestamp - b.timestamp)) {
    if (location.mocked || (location.coords.accuracy ?? 999) > 60) continue;
    const point = toRoutePoint(location);
    const previous = route[route.length - 1];
    if (previous) {
      const segment = distanceMeters(previous, point);
      const seconds = Math.max(
        1,
        (point.timestamp - previous.timestamp) / 1000,
      );
      const calculatedSpeed = segment / seconds;
      const maximumSpeed = ride.vehicleKind === "bike" ? 55 : 75;
      if (segment < 3 || calculatedSpeed > maximumSpeed) continue;
      if ((point.speed ?? calculatedSpeed) < 0.7 && segment < 20) continue;
      distanceKm += segment / 1000;
    }
    route.push(point);
  }

  const compactRoute =
    route.length > 600
      ? route.filter(
          (_, index) => index % 2 === 0 || index === route.length - 1,
        )
      : route;
  await saveActiveRide({
    ...ride,
    route: compactRoute,
    distanceKm: Number(distanceKm.toFixed(3)),
  });
};

const enqueueCompletedTrip = async (trip: CommuteTrip) => {
  const existing = (await readJson<CommuteTrip[]>(COMPLETED_RIDES_KEY)) ?? [];
  if (existing.some((item) => item.id === trip.id)) return;
  await AsyncStorage.setItem(
    COMPLETED_RIDES_KEY,
    JSON.stringify([...existing, trip]),
  );
};

const compactCompletedRoute = (route: RoutePoint[]) => {
  if (route.length <= 140) return route;
  const step = Math.ceil(route.length / 140);
  return route.filter(
    (_, index) =>
      index === 0 || index === route.length - 1 || index % step === 0,
  );
};

export async function consumeCompletedTrips() {
  const trips = (await readJson<CommuteTrip[]>(COMPLETED_RIDES_KEY)) ?? [];
  if (trips.length) await AsyncStorage.removeItem(COMPLETED_RIDES_KEY);
  return trips;
}

const beginRide = async (
  config: Pick<
    ActiveRide,
    "vehicleId" | "vehicleName" | "vehicleKind" | "automatic" | "home" | "work"
  >,
  initialLocation?: Location.LocationObject,
  startZone?: CommuteZone,
) => {
  const existing = await getActiveRide();
  if (existing) return existing;
  const firstPoint = initialLocation
    ? toRoutePoint(initialLocation)
    : undefined;
  const ride: ActiveRide = {
    ...config,
    id: createRideId(),
    startedAt: new Date(initialLocation?.timestamp ?? Date.now()).toISOString(),
    startZone: startZone ?? zoneForPoint(firstPoint, config.home, config.work),
    distanceKm: 0,
    route: firstPoint ? [firstPoint] : [],
  };
  await saveActiveRide(ride);
  return ride;
};

const startNativeLocationUpdates = async () => {
  if (await Location.hasStartedLocationUpdatesAsync(RIDE_LOCATION_TASK)) return;
  await Location.startLocationUpdatesAsync(RIDE_LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    distanceInterval: 8,
    timeInterval: 5_000,
    deferredUpdatesDistance: 30,
    deferredUpdatesInterval: 20_000,
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.AutomotiveNavigation,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "Ride tracking active",
      notificationBody: "Calculating your vehicle distance",
      notificationColor: "#3182F6",
      killServiceOnDestroy: false,
    },
  });
};

export async function requestRidePermissions() {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (!foreground.granted)
    return { granted: false, reason: "foreground" as const };
  const background = await Location.requestBackgroundPermissionsAsync();
  if (!background.granted)
    return { granted: false, reason: "background" as const };
  return { granted: true, reason: undefined };
}

export async function startRide(config: {
  vehicleId: string;
  vehicleName: string;
  vehicleKind: VehicleKind;
  home?: CommutePlace;
  work?: CommutePlace;
  automatic?: boolean;
}) {
  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });
  const ride = await beginRide(
    { ...config, automatic: Boolean(config.automatic) },
    location,
  );
  await startNativeLocationUpdates();
  return ride;
}

export async function finishRide() {
  const ride = await getActiveRide();
  if (!ride) return null;
  try {
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    await appendLocations([location]);
  } catch {
    // The accumulated background route is still valid if the final fix is unavailable.
  }
  const completedRide = (await getActiveRide()) ?? ride;
  if (await Location.hasStartedLocationUpdatesAsync(RIDE_LOCATION_TASK)) {
    await Location.stopLocationUpdatesAsync(RIDE_LOCATION_TASK);
  }
  await AsyncStorage.removeItem(ACTIVE_RIDE_KEY);
  if (completedRide.distanceKm < 0.05 || completedRide.route.length < 2)
    return null;

  const endZone = zoneForPoint(
    completedRide.route[completedRide.route.length - 1],
    completedRide.home,
    completedRide.work,
  );
  const trip: CommuteTrip = {
    id: completedRide.id,
    vehicleId: completedRide.vehicleId,
    startedAt: completedRide.startedAt,
    endedAt: new Date().toISOString(),
    distanceKm: Number(completedRide.distanceKm.toFixed(2)),
    direction: directionForZones(completedRide.startZone, endZone),
    route: compactCompletedRoute(completedRide.route),
    source: "gps",
  };
  await enqueueCompletedTrip(trip);
  return trip;
}

export async function setAutoTracking(config: AutoTrackingConfig | null) {
  if (!config?.enabled) {
    await AsyncStorage.removeItem(AUTO_CONFIG_KEY);
    if (await Location.hasStartedGeofencingAsync(COMMUTE_GEOFENCE_TASK)) {
      await Location.stopGeofencingAsync(COMMUTE_GEOFENCE_TASK);
    }
    return;
  }
  await AsyncStorage.setItem(AUTO_CONFIG_KEY, JSON.stringify(config));
  await Location.startGeofencingAsync(COMMUTE_GEOFENCE_TASK, [
    { identifier: "home", ...config.home, radius: GEOFENCE_RADIUS_METERS },
    { identifier: "work", ...config.work, radius: GEOFENCE_RADIUS_METERS },
  ]);
}

if (!TaskManager.isTaskDefined(RIDE_LOCATION_TASK)) {
  TaskManager.defineTask<LocationTaskData>(
    RIDE_LOCATION_TASK,
    async ({ data, error }) => {
      if (error || !data?.locations?.length) return;
      await appendLocations(data.locations);
    },
  );
}

if (!TaskManager.isTaskDefined(COMMUTE_GEOFENCE_TASK)) {
  TaskManager.defineTask<GeofenceTaskData>(
    COMMUTE_GEOFENCE_TASK,
    async ({ data, error }) => {
      if (error || !data?.region?.identifier || data.eventType === undefined)
        return;
      const config = await readJson<AutoTrackingConfig>(AUTO_CONFIG_KEY);
      if (!config?.enabled) return;
      const zone = data.region.identifier === "home" ? "home" : "work";

      if (
        data.eventType === Location.GeofencingEventType.Exit &&
        !(await getActiveRide())
      ) {
        await beginRide(
          {
            vehicleId: config.vehicleId,
            vehicleName: config.vehicleName,
            vehicleKind: config.vehicleKind,
            automatic: true,
            home: config.home,
            work: config.work,
          },
          undefined,
          zone,
        );
        await startNativeLocationUpdates();
        return;
      }

      if (data.eventType === Location.GeofencingEventType.Enter) {
        const ride = await getActiveRide();
        if (ride && ride.distanceKm >= 0.2) await finishRide();
      }
    },
  );
}
