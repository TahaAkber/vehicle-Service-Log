import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { getHealth, getOilHealth, useVehicleStore } from "../data/vehicleStore";
import EmptyGarageScreen from "./EmptyGarageScreen";

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
};

type IconName = React.ComponentProps<typeof Ionicons>["name"];

function MetricCard({
  icon,
  color,
  label,
  value,
  caption,
}: {
  icon: IconName;
  color: string;
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <View style={styles.metricCard}>
      <View style={[styles.metricIcon, { backgroundColor: `${color}18` }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricCaption}>{caption}</Text>
    </View>
  );
}

export default function AnalyticsScreen() {
  const { garage, activeVehicle: vehicle, isLoading, selectVehicle } = useVehicleStore();
  const [showVehicles, setShowVehicles] = useState(false);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color={C.cyan} />
      </SafeAreaView>
    );
  }

  if (!vehicle) return <EmptyGarageScreen />;

  const fuelLogs = vehicle.logs.filter((log) => log.type === "fuel");
  const orderedFuelLogs = fuelLogs
    .filter((log) => log.liters && log.liters > 0)
    .sort(
      (a, b) =>
        a.odometer - b.odometer || new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
  const serviceLogs = vehicle.logs.filter((log) => ["oil", "chain", "service"].includes(log.type));
  const totalFuel = fuelLogs.reduce((sum, log) => sum + (log.liters ?? 0), 0);
  const totalSpend = fuelLogs.reduce((sum, log) => sum + (log.amount ?? 0), 0);
  const oldestReading = vehicle.logs.length
    ? Math.min(...vehicle.logs.map((log) => log.odometer))
    : vehicle.odometer;
  const trackedDistance = Math.max(0, vehicle.odometer - oldestReading);
  const fuelEfficiency = (() => {
    let previousFullOdometer: number | null = null;
    let intervalFuel = 0;
    let distance = 0;
    let consumedFuel = 0;

    for (const log of orderedFuelLogs) {
      if (previousFullOdometer === null) {
        if (log.fullTank) previousFullOdometer = log.odometer;
        continue;
      }

      intervalFuel += log.liters ?? 0;
      if (log.fullTank && log.odometer > previousFullOdometer) {
        distance += log.odometer - previousFullOdometer;
        consumedFuel += intervalFuel;
        previousFullOdometer = log.odometer;
        intervalFuel = 0;
      }
    }
    return consumedFuel > 0 ? distance / consumedFuel : null;
  })();
  const oil = getOilHealth(vehicle);
  const chain = getHealth(vehicle.odometer, vehicle.chainLastServiced, vehicle.chainInterval);
  const maxBar = Math.max(vehicle.dailyCommute * 7, trackedDistance, 1);
  const weeklyProjection = vehicle.dailyCommute * 7;

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>VEHICLE INSIGHTS</Text>
            <Text style={styles.title}>Analytics</Text>
          </View>
          <Pressable style={styles.vehicleBadge} onPress={() => setShowVehicles((value) => !value)}>
            <Ionicons name="bicycle-outline" size={16} color={C.cyan} />
            <Text style={styles.vehicleBadgeText} numberOfLines={1}>{vehicle.name}</Text>
            <Ionicons name={showVehicles ? "chevron-up" : "chevron-down"} size={13} color={C.muted} />
          </Pressable>
        </View>

        {showVehicles ? (
          <View style={styles.vehicleMenu}>
            {garage.vehicles.map((item) => (
              <Pressable
                key={item.id}
                style={[styles.vehicleOption, item.id === vehicle.id && styles.vehicleOptionSelected]}
                onPress={() => {
                  selectVehicle(item.id);
                  setShowVehicles(false);
                }}
              >
                <Ionicons name="bicycle-outline" size={17} color={item.id === vehicle.id ? C.cyan : C.muted} />
                <View style={styles.vehicleOptionCopy}>
                  <Text style={styles.vehicleOptionTitle}>{item.name}</Text>
                  <Text style={styles.vehicleOptionSubtitle}>{item.logs.length} saved entries</Text>
                </View>
                {item.id === vehicle.id ? <Ionicons name="checkmark-circle" size={19} color={C.green} /> : null}
              </Pressable>
            ))}
          </View>
        ) : null}

        <LinearGradient
          colors={["#173B80", "#12617B"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View>
            <Text style={styles.heroLabel}>ESTIMATED FUEL EFFICIENCY</Text>
            {fuelEfficiency ? (
              <View style={styles.heroValueRow}>
                <Text style={styles.heroValue}>{fuelEfficiency.toFixed(1)}</Text>
                <Text style={styles.heroUnit}>km/L</Text>
              </View>
            ) : (
              <Text style={styles.heroPending}>Mark two refuels as full tank to calculate</Text>
            )}
          </View>
          <View style={styles.heroIcon}>
            <Ionicons name="leaf-outline" size={30} color="#B8F7DF" />
          </View>
        </LinearGradient>

        <Text style={styles.sectionTitle}>Overview</Text>
        <View style={styles.metricGrid}>
          <MetricCard
            icon="navigate-outline"
            color={C.cyan}
            label="TRACKED DISTANCE"
            value={`${trackedDistance.toLocaleString()} km`}
            caption="Across saved entries"
          />
          <MetricCard
            icon="flame-outline"
            color={C.green}
            label="FUEL SPEND"
            value={`Rs ${Math.round(totalSpend).toLocaleString()}`}
            caption={`${totalFuel.toFixed(1)} L across ${fuelLogs.length} refills`}
          />
          <MetricCard
            icon="construct-outline"
            color={C.amber}
            label="SERVICE LOGS"
            value={String(serviceLogs.length)}
            caption="Maintenance entries"
          />
          <MetricCard
            icon="speedometer-outline"
            color={C.blue}
            label="ODOMETER"
            value={`${vehicle.odometer.toLocaleString()} km`}
            caption="Latest saved reading"
          />
        </View>

        <Text style={styles.sectionTitle}>Distance snapshot</Text>
        <View style={styles.chartCard}>
          <View style={styles.chartRow}>
            <View style={styles.chartCopy}>
              <Text style={styles.chartLabel}>Daily commute</Text>
              <Text style={styles.chartValue}>{vehicle.dailyCommute} km</Text>
            </View>
            <View style={styles.chartTrack}>
              <View
                style={[
                  styles.chartFill,
                  { width: `${Math.max(4, (vehicle.dailyCommute / maxBar) * 100)}%`, backgroundColor: C.cyan },
                ]}
              />
            </View>
          </View>
          <View style={styles.chartRow}>
            <View style={styles.chartCopy}>
              <Text style={styles.chartLabel}>Weekly projection</Text>
              <Text style={styles.chartValue}>{weeklyProjection} km</Text>
            </View>
            <View style={styles.chartTrack}>
              <View
                style={[
                  styles.chartFill,
                  { width: `${Math.max(4, (weeklyProjection / maxBar) * 100)}%`, backgroundColor: C.blue },
                ]}
              />
            </View>
          </View>
          <View style={[styles.chartRow, styles.chartRowLast]}>
            <View style={styles.chartCopy}>
              <Text style={styles.chartLabel}>Total tracked</Text>
              <Text style={styles.chartValue}>{trackedDistance} km</Text>
            </View>
            <View style={styles.chartTrack}>
              <View
                style={[
                  styles.chartFill,
                  { width: `${Math.max(4, (trackedDistance / maxBar) * 100)}%`, backgroundColor: C.green },
                ]}
              />
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Maintenance usage</Text>
        <View style={styles.maintenanceCard}>
          <UsageRow label="Engine oil life" value={oil.percent} color={oil.percent > 30 ? C.green : C.amber} />
          <UsageRow label="Chain service life" value={chain.percent} color={chain.percent > 30 ? C.green : C.amber} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function UsageRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.usageRow}>
      <View style={styles.usageTop}>
        <Text style={styles.usageLabel}>{label}</Text>
        <Text style={[styles.usageValue, { color }]}>{value}%</Text>
      </View>
      <View style={styles.usageTrack}>
        <View style={[styles.usageFill, { width: `${value}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.bg },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.bg },
  content: { padding: 20, paddingTop: 15, paddingBottom: 35 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 22 },
  eyebrow: { color: C.cyan, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  title: { marginTop: 4, color: C.text, fontSize: 28, fontWeight: "800", letterSpacing: -0.7 },
  vehicleBadge: { maxWidth: "49%", flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  vehicleBadgeText: { flexShrink: 1, color: "#C9D3E1", fontSize: 10, fontWeight: "700" },
  vehicleMenu: { marginTop: -10, marginBottom: 16, padding: 7, gap: 5, borderRadius: 16, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  vehicleOption: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 11 },
  vehicleOptionSelected: { backgroundColor: "#16253A" },
  vehicleOptionCopy: { flex: 1 },
  vehicleOptionTitle: { color: C.text, fontSize: 12, fontWeight: "700" },
  vehicleOptionSubtitle: { marginTop: 2, color: C.muted, fontSize: 9 },
  hero: { minHeight: 145, flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 21, borderRadius: 22, overflow: "hidden" },
  heroLabel: { color: "#C6E8FA", fontSize: 9, fontWeight: "900", letterSpacing: 1.1 },
  heroValueRow: { flexDirection: "row", alignItems: "baseline", marginTop: 10 },
  heroValue: { color: "#FFFFFF", fontSize: 40, fontWeight: "900", letterSpacing: -1.2 },
  heroUnit: { marginLeft: 6, color: "#B9E8F5", fontSize: 15, fontWeight: "700" },
  heroPending: { maxWidth: 210, marginTop: 11, color: "#FFFFFF", fontSize: 19, lineHeight: 26, fontWeight: "800" },
  heroIcon: { width: 61, height: 61, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.12)" },
  sectionTitle: { marginTop: 27, marginBottom: 12, color: C.text, fontSize: 16, fontWeight: "800" },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metricCard: { width: "48%", flexGrow: 1, minHeight: 145, padding: 14, borderRadius: 17, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  metricIcon: { width: 37, height: 37, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  metricLabel: { marginTop: 12, color: C.muted, fontSize: 8, fontWeight: "900", letterSpacing: 0.65 },
  metricValue: { marginTop: 5, color: C.text, fontSize: 19, fontWeight: "900" },
  metricCaption: { marginTop: 4, color: C.muted, fontSize: 9 },
  chartCard: { padding: 16, borderRadius: 18, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  chartRow: { marginBottom: 18 },
  chartRowLast: { marginBottom: 0 },
  chartCopy: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  chartLabel: { color: "#C6D0DF", fontSize: 11, fontWeight: "600" },
  chartValue: { color: C.text, fontSize: 11, fontWeight: "800" },
  chartTrack: { height: 7, overflow: "hidden", borderRadius: 5, backgroundColor: "#273248" },
  chartFill: { height: "100%", borderRadius: 5 },
  maintenanceCard: { paddingHorizontal: 16, borderRadius: 18, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  usageRow: { paddingVertical: 16 },
  usageTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 9 },
  usageLabel: { color: "#C6D0DF", fontSize: 12, fontWeight: "700" },
  usageValue: { fontSize: 12, fontWeight: "900" },
  usageTrack: { height: 6, overflow: "hidden", borderRadius: 4, backgroundColor: "#273248" },
  usageFill: { height: "100%", borderRadius: 4 },
});
