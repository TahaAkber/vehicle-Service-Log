import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  consumeCompletedTrips,
  finishRide,
  getActiveRide,
  requestRidePermissions,
  setAutoTracking,
  startRide,
  type ActiveRide,
  type CommutePlace,
  type CommuteTrip,
} from "../data/rideTracker";
import { createLogId, sortLogsNewest, useVehicleStore } from "../data/vehicleStore";
import EmptyGarageScreen from "./EmptyGarageScreen";
import LocationSearchSheet from "./LocationSearchSheet";
import RideMap from "./RideMap";

const C = {
  bg: "#070C18",
  surface: "#111827",
  raised: "#172033",
  border: "#243047",
  text: "#F8FAFC",
  muted: "#8D9AAF",
  blue: "#3182F6",
  cyan: "#52D6FF",
  green: "#36D399",
  amber: "#FFB84D",
  red: "#FF647C",
};

const sameLocalDay = (isoDate: string, now = new Date()) => {
  const date = new Date(isoDate);
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
};

const directionMeta = {
  outbound: { label: "Outbound", icon: "arrow-forward-outline" as const, color: C.cyan },
  return: { label: "Return", icon: "arrow-back-outline" as const, color: C.green },
  other: { label: "Other trip", icon: "navigate-outline" as const, color: C.amber },
};

const formatDuration = (startedAt: string, endedAt?: string) => {
  const milliseconds = new Date(endedAt ?? Date.now()).getTime() - new Date(startedAt).getTime();
  const totalMinutes = Math.max(0, Math.floor(milliseconds / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? `${hours}h ${minutes}m` : `${minutes} min`;
};

export default function RideTrackerScreen() {
  const { garage, activeVehicle: vehicle, isLoading, updateVehicle } = useVehicleStore();
  const [activeRide, setActiveRide] = useState<ActiveRide | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [searchKind, setSearchKind] = useState<"home" | "work" | null>(null);
  const [, setClock] = useState(0);

  const storeDetectedTrip = useCallback((trip: CommuteTrip) => {
    const target = garage.vehicles.find((item) => item.id === trip.vehicleId);
    if (!target) return;
    updateVehicle(trip.vehicleId, (current) => ({
      ...current,
      commuteTrips: current.commuteTrips.some((item) => item.id === trip.id)
        ? current.commuteTrips
        : [trip, ...current.commuteTrips],
    }));

    Alert.alert(
      "Trip detected",
      `${trip.distanceKm.toFixed(2)} km ${directionMeta[trip.direction].label.toLowerCase()} trip was recorded for ${target.name}. Add this GPS estimate to its odometer?`,
      [
        { text: "Keep trip only", style: "cancel" },
        {
          text: "Add to odometer",
          onPress: () => updateVehicle(trip.vehicleId, (current) => {
            const savedTrip = current.commuteTrips.find((item) => item.id === trip.id) ?? trip;
            if (savedTrip.odometerApplied) return current;
            const nextOdometer = Number((current.odometer + trip.distanceKm).toFixed(1));
            return {
              ...current,
              odometer: nextOdometer,
              commuteTrips: current.commuteTrips.map((item) =>
                item.id === trip.id ? { ...item, odometerApplied: true } : item,
              ),
              logs: sortLogsNewest([
                {
                  id: createLogId(),
                  type: "odometer",
                  title: "GPS trip added",
                  date: trip.endedAt,
                  odometer: nextOdometer,
                  source: "gps",
                  note: `${trip.distanceKm.toFixed(2)} km ${directionMeta[trip.direction].label.toLowerCase()} trip`,
                },
                ...current.logs,
              ]),
            };
          }),
        },
      ],
    );
  }, [garage.vehicles, updateVehicle]);

  const refreshTracker = useCallback(async () => {
    const [ride, completed] = await Promise.all([getActiveRide(), consumeCompletedTrips()]);
    setActiveRide(ride);
    completed.forEach(storeDetectedTrip);
  }, [storeDetectedTrip]);

  useEffect(() => {
    void refreshTracker();
    const interval = setInterval(() => {
      setClock((value) => value + 1);
      void refreshTracker();
    }, 3_000);
    return () => clearInterval(interval);
  }, [refreshTracker]);

  if (isLoading) {
    return <SafeAreaView style={styles.loading}><ActivityIndicator color={C.cyan} /></SafeAreaView>;
  }
  if (!vehicle) return <EmptyGarageScreen />;

  const todayTrips = vehicle.commuteTrips.filter((trip) => sameLocalDay(trip.startedAt));
  const todayDistance = todayTrips.reduce((sum, trip) => sum + trip.distanceKm, 0);
  const goingDistance = todayTrips.filter((trip) => trip.direction === "outbound").reduce((sum, trip) => sum + trip.distanceKm, 0);
  const returnDistance = todayTrips.filter((trip) => trip.direction === "return").reduce((sum, trip) => sum + trip.distanceKm, 0);
  const visibleRoute = activeRide?.vehicleId === vehicle.id
    ? activeRide.route
    : (vehicle.commuteTrips[0]?.route ?? []);

  const performStart = async () => {
    setIsWorking(true);
    try {
      const permission = await requestRidePermissions();
      if (!permission.granted) {
        Alert.alert(
          "Background location needed",
          "Choose Allow all the time in app settings so the ride continues when the screen is locked.",
          [{ text: "Cancel", style: "cancel" }, { text: "Open settings", onPress: Linking.openSettings }],
        );
        return;
      }
      await Location.requestMotionActivityPermissionsAsync().catch(() => undefined);
      const ride = await startRide({
        vehicleId: vehicle.id,
        vehicleName: vehicle.name,
        vehicleKind: vehicle.vehicleKind,
        home: vehicle.commuteHome,
        work: vehicle.commuteWork,
      });
      setActiveRide(ride);
    } catch (error) {
      Alert.alert("Could not start ride", error instanceof Error ? error.message : "Check GPS and permissions.");
    } finally {
      setIsWorking(false);
    }
  };

  const confirmStart = () => Alert.alert(
    `Track ${vehicle.name}?`,
    "GPS will run in the background and Android will show a persistent ride-tracking notification.",
    [{ text: "Cancel", style: "cancel" }, { text: "Start ride", onPress: () => void performStart() }],
  );

  const stop = async () => {
    setIsWorking(true);
    try {
      await finishRide();
      await refreshTracker();
    } catch (error) {
      Alert.alert("Could not end ride", error instanceof Error ? error.message : "Try again.");
    } finally {
      setIsWorking(false);
    }
  };

  const savePlace = async (kind: "home" | "work", place: CommutePlace) => {
    setSearchKind(null);
    setIsWorking(true);
    try {
      const home = kind === "home" ? place : vehicle.commuteHome;
      const work = kind === "work" ? place : vehicle.commuteWork;
      updateVehicle(vehicle.id, (current) => ({
        ...current,
        commuteHome: kind === "home" ? place : current.commuteHome,
        commuteWork: kind === "work" ? place : current.commuteWork,
      }));
      if (vehicle.autoCommuteTracking && home && work) {
        await setAutoTracking({
          enabled: true,
          vehicleId: vehicle.id,
          vehicleName: vehicle.name,
          vehicleKind: vehicle.vehicleKind,
          home,
          work,
        });
      }
      Alert.alert(`${kind === "home" ? "Home" : "Work"} saved`, place.label);
    } catch (error) {
      Alert.alert("Could not save location", error instanceof Error ? error.message : "Try again outdoors.");
    } finally {
      setIsWorking(false);
    }
  };

  const toggleAutomatic = async () => {
    if (vehicle.autoCommuteTracking) {
      await setAutoTracking(null);
      updateVehicle(vehicle.id, (current) => ({ ...current, autoCommuteTracking: false }));
      return;
    }
    if (!vehicle.commuteHome || !vehicle.commuteWork) {
      Alert.alert("Set Home and Work first", "Save both locations before enabling automatic commute detection.");
      return;
    }
    const permission = await requestRidePermissions();
    if (!permission.granted) {
      Alert.alert("Always-on location needed", "Allow background location from app settings.", [
        { text: "Cancel", style: "cancel" },
        { text: "Open settings", onPress: Linking.openSettings },
      ]);
      return;
    }
    await setAutoTracking({
      enabled: true,
      vehicleId: vehicle.id,
      vehicleName: vehicle.name,
      vehicleKind: vehicle.vehicleKind,
      home: vehicle.commuteHome,
      work: vehicle.commuteWork,
    });
    garage.vehicles.forEach((item) => {
      if (item.id !== vehicle.id && item.autoCommuteTracking) {
        updateVehicle(item.id, (current) => ({ ...current, autoCommuteTracking: false }));
      }
    });
    updateVehicle(vehicle.id, (current) => ({ ...current, autoCommuteTracking: true }));
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>GPS COMMUTE</Text>
            <Text style={styles.title}>Ride tracker</Text>
          </View>
          <View style={styles.vehicleBadge}>
            <Ionicons name={vehicle.vehicleKind === "bike" ? "bicycle-outline" : "car-outline"} size={17} color={C.cyan} />
            <Text style={styles.vehicleName} numberOfLines={1}>{vehicle.name}</Text>
          </View>
        </View>

        <RideMap route={visibleRoute} home={vehicle.commuteHome} work={vehicle.commuteWork} />

        <View style={styles.liveCard}>
          <View style={styles.liveTop}>
            <View style={[styles.liveDot, activeRide && styles.liveDotActive]} />
            <Text style={styles.liveLabel}>{activeRide ? "TRACKING LIVE" : "READY TO TRACK"}</Text>
            {activeRide ? <Text style={styles.liveDuration}>{formatDuration(activeRide.startedAt)}</Text> : null}
          </View>
          <View style={styles.distanceRow}>
            <Text style={styles.distanceValue}>{(activeRide?.distanceKm ?? 0).toFixed(2)}</Text>
            <Text style={styles.distanceUnit}>km</Text>
          </View>
          {activeRide && activeRide.vehicleId !== vehicle.id ? (
            <Text style={styles.notice}>Currently tracking {activeRide.vehicleName}. End that ride before starting another.</Text>
          ) : null}
          <Pressable
            style={[styles.rideButton, activeRide ? styles.stopButton : styles.startButton]}
            onPress={activeRide ? () => void stop() : confirmStart}
            disabled={isWorking}
          >
            {isWorking ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name={activeRide ? "stop" : "navigate"} size={21} color="#FFFFFF" />}
            <Text style={styles.rideButtonText}>{activeRide ? "End ride" : "Start ride"}</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>Today</Text>
        <View style={styles.summaryRow}>
          <Summary label="TOTAL" value={todayDistance} color={C.cyan} />
          <Summary label="OUTBOUND" value={goingDistance} color={C.amber} />
          <Summary label="RETURN" value={returnDistance} color={C.green} />
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Automatic commute</Text>
          <Pressable style={[styles.switch, vehicle.autoCommuteTracking && styles.switchOn]} onPress={() => void toggleAutomatic()}>
            <View style={[styles.switchThumb, vehicle.autoCommuteTracking && styles.switchThumbOn]} />
          </Pressable>
        </View>
        <View style={styles.placeCard}>
          <PlaceRow kind="home" place={vehicle.commuteHome} onPress={() => setSearchKind("home")} />
          <View style={styles.placeDivider} />
          <PlaceRow kind="work" place={vehicle.commuteWork} onPress={() => setSearchKind("work")} />
        </View>
        <Text style={styles.helper}>Leave Home or Work to start automatically. Reaching the opposite location classifies the trip as outbound or return.</Text>

        <Text style={styles.sectionTitle}>Recent trips</Text>
        {vehicle.commuteTrips.length ? vehicle.commuteTrips.slice(0, 8).map((trip) => <TripRow key={trip.id} trip={trip} />) : (
          <View style={styles.empty}><Ionicons name="map-outline" size={28} color={C.muted} /><Text style={styles.emptyText}>Your detected rides will appear here.</Text></View>
        )}
      </ScrollView>
      {searchKind ? (
        <LocationSearchSheet
          visible
          kind={searchKind}
          initialPlace={searchKind === "home" ? vehicle.commuteHome : vehicle.commuteWork}
          home={vehicle.commuteHome}
          work={vehicle.commuteWork}
          onClose={() => setSearchKind(null)}
          onSelect={(place) => void savePlace(searchKind, place)}
        />
      ) : null}
    </SafeAreaView>
  );
}

function Summary({ label, value, color }: { label: string; value: number; color: string }) {
  return <View style={styles.summary}><Text style={styles.summaryLabel}>{label}</Text><Text style={[styles.summaryValue, { color }]}>{value.toFixed(1)} km</Text></View>;
}

function PlaceRow({ kind, place, onPress }: { kind: "home" | "work"; place?: CommutePlace; onPress: () => void }) {
  const title = kind === "home" ? "Home" : "Work";
  return (
    <Pressable style={styles.placeRow} onPress={onPress}>
      <View style={[styles.placeIcon, { backgroundColor: kind === "home" ? "#123D31" : "#3A2B16" }]}>
        <Ionicons name={kind === "home" ? "home-outline" : "briefcase-outline"} size={19} color={kind === "home" ? C.green : C.amber} />
      </View>
      <View style={styles.placeCopy}><Text style={styles.placeTitle}>{title}</Text><Text style={styles.placeAddress} numberOfLines={1}>{place?.label ?? `Tap while you are at ${title}`}</Text></View>
      <Text style={styles.setText}>{place ? "Update" : "Set"}</Text>
    </Pressable>
  );
}

function TripRow({ trip }: { trip: CommuteTrip }) {
  const meta = directionMeta[trip.direction];
  return (
    <View style={styles.tripRow}>
      <View style={[styles.tripIcon, { backgroundColor: `${meta.color}18` }]}><Ionicons name={meta.icon} size={19} color={meta.color} /></View>
      <View style={styles.tripCopy}><Text style={styles.tripTitle}>{meta.label}</Text><Text style={styles.tripMeta}>{new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(trip.startedAt))} · {formatDuration(trip.startedAt, trip.endedAt)}</Text></View>
      <View style={styles.tripRight}><Text style={styles.tripDistance}>{trip.distanceKm.toFixed(2)} km</Text><Text style={styles.tripApplied}>{trip.odometerApplied ? "Added to odometer" : "GPS only"}</Text></View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.bg },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.bg },
  content: { padding: 20, paddingTop: 15, paddingBottom: 42 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
  eyebrow: { color: C.cyan, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  title: { marginTop: 4, color: C.text, fontSize: 28, fontWeight: "800", letterSpacing: -0.7 },
  vehicleBadge: { maxWidth: "48%", flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  vehicleName: { flexShrink: 1, color: C.text, fontSize: 10, fontWeight: "700" },
  liveCard: { marginTop: 12, padding: 17, borderRadius: 20, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  liveTop: { flexDirection: "row", alignItems: "center" },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.muted },
  liveDotActive: { backgroundColor: C.green },
  liveLabel: { marginLeft: 7, color: C.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  liveDuration: { marginLeft: "auto", color: C.cyan, fontSize: 10, fontWeight: "700" },
  distanceRow: { flexDirection: "row", alignItems: "baseline", marginVertical: 8 },
  distanceValue: { color: C.text, fontSize: 41, fontWeight: "900", letterSpacing: -1.2 },
  distanceUnit: { marginLeft: 7, color: C.muted, fontSize: 15, fontWeight: "700" },
  notice: { marginBottom: 10, color: C.amber, fontSize: 10, lineHeight: 16 },
  rideButton: { minHeight: 51, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 15 },
  startButton: { backgroundColor: C.blue },
  stopButton: { backgroundColor: C.red },
  rideButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  sectionTitle: { marginTop: 25, marginBottom: 11, color: C.text, fontSize: 16, fontWeight: "800" },
  summaryRow: { flexDirection: "row", gap: 8 },
  summary: { flex: 1, minWidth: 0, padding: 12, borderRadius: 15, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  summaryLabel: { color: C.muted, fontSize: 8, fontWeight: "900", letterSpacing: .7 },
  summaryValue: { marginTop: 6, fontSize: 13, fontWeight: "900" },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  switch: { width: 45, height: 25, marginTop: 14, padding: 3, borderRadius: 14, backgroundColor: C.raised },
  switchOn: { backgroundColor: C.blue },
  switchThumb: { width: 19, height: 19, borderRadius: 10, backgroundColor: C.muted },
  switchThumbOn: { alignSelf: "flex-end", backgroundColor: "#FFFFFF" },
  placeCard: { borderRadius: 18, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  placeRow: { minHeight: 68, flexDirection: "row", alignItems: "center", paddingHorizontal: 13 },
  placeIcon: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  placeCopy: { flex: 1, minWidth: 0, marginLeft: 11 },
  placeTitle: { color: C.text, fontSize: 12, fontWeight: "800" },
  placeAddress: { marginTop: 3, color: C.muted, fontSize: 9 },
  setText: { color: C.cyan, fontSize: 10, fontWeight: "800" },
  placeDivider: { height: StyleSheet.hairlineWidth, marginLeft: 64, backgroundColor: C.border },
  helper: { marginTop: 9, color: C.muted, fontSize: 9, lineHeight: 15 },
  tripRow: { minHeight: 72, flexDirection: "row", alignItems: "center", marginBottom: 8, paddingHorizontal: 12, borderRadius: 16, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  tripIcon: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  tripCopy: { flex: 1, minWidth: 0, marginLeft: 11 },
  tripTitle: { color: C.text, fontSize: 12, fontWeight: "800" },
  tripMeta: { marginTop: 4, color: C.muted, fontSize: 8 },
  tripRight: { alignItems: "flex-end" },
  tripDistance: { color: C.text, fontSize: 11, fontWeight: "900" },
  tripApplied: { marginTop: 4, color: C.muted, fontSize: 8 },
  empty: { alignItems: "center", paddingVertical: 28, borderRadius: 17, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  emptyText: { marginTop: 8, color: C.muted, fontSize: 10 },
});
