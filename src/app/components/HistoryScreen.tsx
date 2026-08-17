import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { LogType, ServiceLog } from "../data/vehicleStore";
import { oilCategoryLabel, ridingConditionLabel, useVehicleStore } from "../data/vehicleStore";
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
  red: "#FF647C",
};

type Filter = "all" | Exclude<LogType, "odometer">;
type IconName = React.ComponentProps<typeof Ionicons>["name"];

const filters: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "oil", label: "Oil" },
  { value: "chain", label: "Chain" },
  { value: "fuel", label: "Fuel" },
  { value: "service", label: "Service" },
];

const logMeta: Record<LogType, { icon: IconName; color: string; label: string }> = {
  oil: { icon: "water-outline", color: C.blue, label: "OIL" },
  chain: { icon: "link-outline", color: C.amber, label: "CHAIN" },
  fuel: { icon: "flame-outline", color: C.green, label: "FUEL" },
  service: { icon: "construct-outline", color: C.cyan, label: "SERVICE" },
  odometer: { icon: "speedometer-outline", color: C.cyan, label: "ODOMETER" },
};

export default function HistoryScreen() {
  const { garage, activeVehicle: vehicle, isLoading, selectVehicle } = useVehicleStore();
  const [filter, setFilter] = useState<Filter>("all");
  const [showVehicles, setShowVehicles] = useState(false);

  const visibleLogs = useMemo(() => {
    if (!vehicle) return [];
    return vehicle.logs.filter((log) => filter === "all" || log.type === filter);
  }, [filter, vehicle]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color={C.cyan} />
      </SafeAreaView>
    );
  }

  if (!vehicle) return <EmptyGarageScreen />;

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>SERVICE RECORDS</Text>
          <Text style={styles.title}>History</Text>
        </View>
        <Pressable style={styles.vehicleButton} onPress={() => setShowVehicles((value) => !value)}>
          <Ionicons name={vehicle.vehicleKind === "bike" ? "bicycle-outline" : "car-outline"} size={16} color={C.cyan} />
          <Text style={styles.vehicleButtonText} numberOfLines={1}>{vehicle.name}</Text>
          <Ionicons name={showVehicles ? "chevron-up" : "chevron-down"} size={14} color={C.muted} />
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
              <View style={styles.vehicleOptionIcon}>
                <Ionicons name={item.vehicleKind === "bike" ? "bicycle-outline" : "car-outline"} size={18} color={item.id === vehicle.id ? C.cyan : C.muted} />
              </View>
              <View style={styles.vehicleOptionCopy}>
                <Text style={styles.vehicleOptionTitle}>{item.name}</Text>
                <Text style={styles.vehicleOptionSubtitle}>{item.logs.length} entries</Text>
              </View>
              {item.id === vehicle.id ? <Ionicons name="checkmark-circle" size={20} color={C.green} /> : null}
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.summaryRow}>
        <Summary value={String(vehicle.logs.length)} label="TOTAL LOGS" />
        <View style={styles.summaryDivider} />
        <Summary
          value={String(vehicle.logs.filter((log) => log.type === "fuel").length)}
          label="REFUELS"
        />
        <View style={styles.summaryDivider} />
        <Summary
          value={String(vehicle.logs.filter((log) => ["oil", "chain", "service"].includes(log.type)).length)}
          label="SERVICES"
        />
      </View>

      <View style={styles.filterWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {filters.map((item) => (
            <Pressable
              key={item.value}
              style={[styles.filterButton, filter === item.value && styles.filterButtonActive]}
              onPress={() => setFilter(item.value)}
            >
              <Text style={[styles.filterText, filter === item.value && styles.filterTextActive]}>{item.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        {visibleLogs.length ? (
          visibleLogs.map((log, index) => (
            <HistoryRow key={log.id} log={log} isLast={index === visibleLogs.length - 1} />
          ))
        ) : (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="filter-outline" size={30} color={C.muted} />
            </View>
            <Text style={styles.emptyTitle}>No matching entries</Text>
            <Text style={styles.emptyCopy}>Try another filter or add a log from the Home tab.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Summary({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function HistoryRow({ log, isLast }: { log: ServiceLog; isLast: boolean }) {
  const meta = logMeta[log.type];
  const date = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(log.date));

  const showDetails = () =>
    Alert.alert(
      log.title,
      [
        `Type: ${meta.label}`,
        `Date: ${date}`,
        `Odometer: ${log.odometer.toLocaleString()} km`,
        log.liters ? `Fuel: ${log.liters} liters` : undefined,
        log.amount ? `Amount: Rs ${log.amount.toLocaleString()}` : undefined,
        log.unitPrice ? `Rate: Rs ${log.unitPrice}/L` : undefined,
        log.fullTank ? "Full tank refill" : undefined,
        log.oilCategory ? `Oil: ${oilCategoryLabel(log.oilCategory)}` : undefined,
        log.oilBrand ? `Brand: ${log.oilBrand}` : undefined,
        log.oilViscosity ? `Viscosity: ${log.oilViscosity}` : undefined,
        log.oilInterval ? `Change interval: ${log.oilInterval.toLocaleString()} km` : undefined,
        log.oilTimeIntervalMonths ? `Maximum age: ${log.oilTimeIntervalMonths} months` : undefined,
        log.ridingCondition ? `Usage: ${ridingConditionLabel(log.ridingCondition)}` : undefined,
        log.note,
      ]
        .filter(Boolean)
        .join("\n"),
    );

  return (
    <Pressable style={styles.historyRow} onPress={showDetails}>
      <View style={styles.timelineColumn}>
        <View style={[styles.historyIcon, { backgroundColor: `${meta.color}18` }]}>
          <Ionicons name={meta.icon} size={20} color={meta.color} />
        </View>
        {!isLast ? <View style={styles.timelineLine} /> : null}
      </View>
      <View style={styles.historyCard}>
        <View style={styles.historyTop}>
          <View style={[styles.typeBadge, { backgroundColor: `${meta.color}16` }]}>
            <Text style={[styles.typeBadgeText, { color: meta.color }]}>{meta.label}</Text>
          </View>
          <Text style={styles.historyDate}>{date}</Text>
        </View>
        <Text style={styles.historyTitle}>{log.title}</Text>
        <View style={styles.historyBottom}>
          <Ionicons name="speedometer-outline" size={14} color={C.muted} />
          <Text style={styles.historyDistance}>{log.odometer.toLocaleString()} km</Text>
          {log.note ? <Text style={styles.historyNote} numberOfLines={1}>• {log.note}</Text> : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.bg },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 15, paddingBottom: 17 },
  eyebrow: { color: C.cyan, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  title: { marginTop: 4, color: C.text, fontSize: 28, fontWeight: "800", letterSpacing: -0.7 },
  vehicleButton: { maxWidth: "52%", flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  vehicleButtonText: { flexShrink: 1, color: "#C9D3E1", fontSize: 10, fontWeight: "700" },
  vehicleMenu: { position: "absolute", zIndex: 5, top: 76, left: 20, right: 20, padding: 7, borderRadius: 17, backgroundColor: C.raised, borderWidth: 1, borderColor: "#344158", shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 18, elevation: 18 },
  vehicleOption: { flexDirection: "row", alignItems: "center", minHeight: 58, paddingHorizontal: 10, borderRadius: 12 },
  vehicleOptionSelected: { backgroundColor: "#102A3E" },
  vehicleOptionIcon: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: C.surface },
  vehicleOptionCopy: { flex: 1, marginLeft: 10 },
  vehicleOptionTitle: { color: C.text, fontSize: 12, fontWeight: "700" },
  vehicleOptionSubtitle: { marginTop: 3, color: C.muted, fontSize: 9 },
  summaryRow: { flexDirection: "row", alignItems: "center", marginHorizontal: 20, paddingVertical: 15, borderRadius: 17, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  summaryItem: { flex: 1, alignItems: "center" },
  summaryValue: { color: C.text, fontSize: 20, fontWeight: "900" },
  summaryLabel: { marginTop: 4, color: C.muted, fontSize: 8, fontWeight: "800", letterSpacing: 0.6 },
  summaryDivider: { width: 1, height: 30, backgroundColor: C.border },
  filterWrap: { marginTop: 17 },
  filters: { gap: 8, paddingHorizontal: 20 },
  filterButton: { minWidth: 57, paddingHorizontal: 14, paddingVertical: 9, alignItems: "center", borderRadius: 20, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  filterButtonActive: { backgroundColor: "#173B55", borderColor: "#286789" },
  filterText: { color: C.muted, fontSize: 10, fontWeight: "700" },
  filterTextActive: { color: C.cyan },
  list: { flex: 1, marginTop: 16 },
  listContent: { paddingHorizontal: 20, paddingBottom: 28 },
  historyRow: { minHeight: 112, flexDirection: "row" },
  timelineColumn: { width: 45, alignItems: "center" },
  historyIcon: { zIndex: 2, width: 41, height: 41, borderRadius: 13, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.border },
  timelineLine: { flex: 1, width: 1, backgroundColor: "#2B384E" },
  historyCard: { flex: 1, minWidth: 0, alignSelf: "flex-start", marginLeft: 9, marginBottom: 12, padding: 14, borderRadius: 16, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  historyTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  typeBadge: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 7 },
  typeBadgeText: { fontSize: 8, fontWeight: "900", letterSpacing: 0.55 },
  historyDate: { color: C.muted, fontSize: 9, fontWeight: "600" },
  historyTitle: { marginTop: 10, color: C.text, fontSize: 13, fontWeight: "700" },
  historyBottom: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  historyDistance: { marginLeft: 5, color: "#B8C3D2", fontSize: 10, fontWeight: "700" },
  historyNote: { flex: 1, marginLeft: 5, color: C.muted, fontSize: 9 },
  emptyState: { alignItems: "center", paddingTop: 52 },
  emptyIcon: { width: 65, height: 65, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: C.surface },
  emptyTitle: { marginTop: 14, color: C.text, fontSize: 15, fontWeight: "800" },
  emptyCopy: { maxWidth: 240, marginTop: 6, color: C.muted, fontSize: 11, lineHeight: 17, textAlign: "center" },
});
