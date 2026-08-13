import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "../../providers/AuthProvider";

import {
  ActivityRow,
  ActivitySheet,
  GarageSheet,
  LogSheet,
  MaintenanceSheet,
  VehicleFormSheet,
  type LogInput,
} from "./DashboardSheets";
import {
  FuelScanner,
  OdometerScanner,
  type FuelScanResult,
  type ScanSource,
} from "./OdometerScanner";
import {
  createLogId,
  getHealth,
  getOilHealth,
  oilCategoryLabel,
  sortLogsNewest,
  type LogType,
  type Vehicle,
  type VehicleInput,
  useVehicleStore,
} from "../data/vehicleStore";
import EmptyGarageScreen from "./EmptyGarageScreen";

const COLORS = {
  background: "#070C18",
  surface: "#111827",
  surfaceRaised: "#172033",
  border: "#243047",
  text: "#F8FAFC",
  muted: "#8D9AAF",
  blue: "#2F80ED",
  cyan: "#52D6FF",
  green: "#36D399",
  amber: "#FFB84D",
  red: "#FF647C",
};

type IconName = React.ComponentProps<typeof Ionicons>["name"];

type HealthCardProps = {
  title: string;
  subtitle: string;
  value: number;
  accent: string;
  icon: IconName;
};

function HealthCard({ title, subtitle, value, accent, icon }: HealthCardProps) {
  return (
    <View style={styles.healthCard}>
      <View style={styles.healthTopRow}>
        <View style={[styles.healthIcon, { backgroundColor: `${accent}18` }]}>
          <Ionicons name={icon} size={20} color={accent} />
        </View>
        <View style={styles.healthCopy}>
          <Text style={styles.healthTitle}>{title}</Text>
          <Text style={styles.healthSubtitle}>{subtitle}</Text>
        </View>
        <View style={[styles.healthPill, { backgroundColor: `${accent}18` }]}>
          <Text style={[styles.healthPillText, { color: accent }]}>{value}%</Text>
        </View>
      </View>
      <View style={styles.progressTrack}>
        <View
          style={[styles.progressFill, { width: `${value}%`, backgroundColor: accent }]}
        />
      </View>
    </View>
  );
}

function formatSavedAt(date?: string) {
  if (!date) return "Saved on this device";
  const savedAt = new Date(date);
  if (Number.isNaN(savedAt.getTime())) return "Saved on this device";
  const today = new Date();
  if (savedAt.toDateString() === today.toDateString()) {
    return `Updated today, ${new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }).format(savedAt)}`;
  }
  return `Updated ${new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(savedAt)}`;
}

export default function DashboardScreen() {
  const { user, signOut } = useAuth();
  const {
    garage,
    activeVehicle: vehicle,
    isLoading,
    selectVehicle,
    addVehicle,
    updateVehicle,
    removeVehicle,
    syncStatus,
    retrySync,
  } = useVehicleStore();
  const [scannerMode, setScannerMode] = useState<"odometer" | "fuel" | null>(null);
  const [sheet, setSheet] = useState<
    "garage" | "vehicle-form" | "log" | "maintenance" | "activity" | null
  >(null);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle>();
  const [logType, setLogType] = useState<Exclude<LogType, "odometer">>("oil");

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.safeArea, styles.loadingScreen]}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color={COLORS.cyan} />
        <Text style={styles.loadingText}>Loading your garage…</Text>
      </SafeAreaView>
    );
  }

  if (!vehicle) return <EmptyGarageScreen />;

  const oilHealth = getOilHealth(vehicle);
  const chainHealth = getHealth(
    vehicle.odometer,
    vehicle.chainLastServiced,
    vehicle.chainInterval,
  );
  const formattedOdometer = new Intl.NumberFormat("en-US").format(vehicle.odometer);
  const oilIsTimeLimited = oilHealth.limitingFactor === "time" && oilHealth.percent <= chainHealth.percent;
  const nextServiceDistance = Math.min(oilHealth.remaining, chainHealth.remaining);
  const nextServiceAt = new Intl.NumberFormat("en-US").format(
    vehicle.odometer + nextServiceDistance,
  );
  const nextOilDate = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(oilHealth.dueDate));
  const latestReadingLog = vehicle.logs.find(
    (log) => Math.abs(log.odometer - vehicle.odometer) < 0.001,
  );
  const readingBadge =
    latestReadingLog?.type === "odometer" &&
    (latestReadingLog.source === "camera" || latestReadingLog.source === "gallery")
      ? "Scanned"
      : latestReadingLog?.type === "odometer" && latestReadingLog.source === "manual"
        ? "Manual"
        : "Saved";

  const healthColor = (percent: number) =>
    percent > 50 ? COLORS.green : percent > 20 ? COLORS.amber : COLORS.red;
  const syncMeta = {
    synced: { label: "Synced", color: COLORS.green, icon: "cloud-done-outline" as const },
    syncing: { label: "Syncing", color: COLORS.cyan, icon: "sync-outline" as const },
    pending: { label: "Pending", color: COLORS.amber, icon: "cloud-upload-outline" as const },
    offline: { label: "Offline", color: COLORS.amber, icon: "cloud-offline-outline" as const },
    error: { label: "Retry sync", color: COLORS.red, icon: "alert-circle-outline" as const },
  }[syncStatus];

  const openLog = (type: Exclude<LogType, "odometer">) => {
    setLogType(type);
    setSheet("log");
  };

  const handleScanSuccess = (reading: number, source: ScanSource) => {
    const nextReading = Number(reading.toFixed(1));
    setScannerMode(null);
    if (nextReading < vehicle.odometer) {
      Alert.alert(
        "Reading not saved",
        `The scanned value is lower than the current ${vehicle.odometer.toLocaleString()} km reading. Scan it again.`,
      );
      return;
    }
    updateVehicle(vehicle.id, (current) => ({
      ...current,
      odometer: nextReading,
      logs: sortLogsNewest([
        {
          id: createLogId(),
          type: "odometer",
          title: source === "manual" ? "Odometer entered manually" : "Odometer scanned",
          date: new Date().toISOString(),
          odometer: nextReading,
          source,
        },
        ...current.logs,
      ]),
    }));
    Alert.alert("Reading updated", `${nextReading.toLocaleString()} km has been saved.`);
  };

  const handleSaveLog = (input: LogInput) => {
    const logDate = input.date ?? new Date().toISOString();
    const titles = {
      oil: "Engine oil changed",
      chain: "Chain lubed & cleaned",
      fuel: `Refueled ${input.liters} liters`,
      service: input.note,
    };
    updateVehicle(vehicle.id, (current) => ({
      ...current,
      odometer: Math.max(current.odometer, input.odometer),
      oilLastChanged: input.type === "oil" ? input.odometer : current.oilLastChanged,
      oilLastChangedAt:
        input.type === "oil" ? logDate : current.oilLastChangedAt,
      oilCategory:
        input.type === "oil" && input.oilCategory ? input.oilCategory : current.oilCategory,
      oilType:
        input.type === "oil" && input.oilCategory
          ? oilCategoryLabel(input.oilCategory)
          : current.oilType,
      oilBrand:
        input.type === "oil" && input.oilBrand !== undefined
          ? input.oilBrand
          : current.oilBrand,
      oilViscosity:
        input.type === "oil" && input.oilViscosity !== undefined
          ? input.oilViscosity
          : current.oilViscosity,
      oilInterval:
        input.type === "oil" && input.oilInterval
          ? input.oilInterval
          : current.oilInterval,
      oilTimeIntervalMonths:
        input.type === "oil" && input.oilTimeIntervalMonths
          ? input.oilTimeIntervalMonths
          : current.oilTimeIntervalMonths,
      ridingCondition:
        input.type === "oil" && input.ridingCondition
          ? input.ridingCondition
          : current.ridingCondition,
      chainLastServiced:
        input.type === "chain" ? input.odometer : current.chainLastServiced,
      logs: sortLogsNewest([
        {
          id: createLogId(),
          type: input.type,
          title: titles[input.type] || "Service logged",
          date: logDate,
          odometer: input.odometer,
          liters: input.liters,
          amount: input.amount,
          unitPrice: input.unitPrice,
          fullTank: input.fullTank,
          source: input.source,
          oilCategory: input.oilCategory,
          oilBrand: input.oilBrand,
          oilViscosity: input.oilViscosity,
          oilInterval: input.oilInterval,
          oilTimeIntervalMonths: input.oilTimeIntervalMonths,
          ridingCondition: input.ridingCondition,
          note: input.type === "service" ? undefined : input.note || undefined,
        },
        ...current.logs,
      ]),
    }));
    setSheet(null);
    Alert.alert("Log saved", `${titles[input.type]} was added successfully.`);
  };

  const handleFuelScanSuccess = (result: FuelScanResult) => {
    setScannerMode(null);
    handleSaveLog({
      type: "fuel",
      odometer: result.odometer,
      liters: result.liters,
      amount: result.amount,
      unitPrice: result.unitPrice,
      fullTank: result.fullTank,
      source: result.source,
      note: result.fullTank ? "Full tank refill" : "",
    });
  };

  const handleSaveVehicle = (input: VehicleInput) => {
    if (editingVehicle) {
      updateVehicle(editingVehicle.id, (current) => ({ ...current, ...input }));
    } else {
      addVehicle(input);
    }
    setEditingVehicle(undefined);
    setSheet("garage");
  };

  const confirmDeleteVehicle = (target: Vehicle) => {
    if (garage.vehicles.length === 1) {
      Alert.alert("Vehicle required", "At least one vehicle must remain in your garage.");
      return;
    }
    Alert.alert(
      `Delete ${target.name}?`,
      "All service logs for this vehicle will also be deleted. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => removeVehicle(target.id) },
      ],
    );
  };

  const confirmSignOut = () => {
    Alert.alert(
      "Sign out?",
      "Unsynced data will remain safe on this device and will sync when you sign in to this account again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: () => signOut().catch((error) => Alert.alert("Could not sign out", error.message)),
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <StatusBar style="light" />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable
            hitSlop={8}
            style={({ pressed }) => [styles.headerControl, pressed && styles.pressed]}
            onPress={() => setSheet("garage")}
          >
            <Ionicons name="settings-outline" size={16} color={COLORS.muted} />
            <Text style={styles.headerControlText}>Options</Text>
          </Pressable>

          <Pressable style={styles.vehicleInfo} hitSlop={8} onPress={() => setSheet("garage")}>
            <Text style={styles.vehicleTitle} numberOfLines={1}>{vehicle.name}</Text>
            <Ionicons name="chevron-down" size={14} color={COLORS.muted} />
          </Pressable>

          <Pressable style={styles.onlinePill} onPress={() => retrySync()} hitSlop={7}>
            <Ionicons name={syncMeta.icon} size={13} color={syncMeta.color} />
            <Text style={[styles.onlineText, { color: syncMeta.color }]}>{syncMeta.label}</Text>
          </Pressable>
        </View>

        <LinearGradient
          colors={["#1D4ED8", "#1767B8", "#0E7490"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.odometerCard}
        >
          <View style={styles.glowOne} />
          <View style={styles.glowTwo} />
          <View style={styles.cardTopRow}>
            <View>
              <Text style={styles.odometerLabel}>TOTAL DISTANCE</Text>
              <Text style={styles.lastUpdated}>{formatSavedAt(latestReadingLog?.date)}</Text>
            </View>
            <View style={styles.verifiedBadge}>
              <Ionicons
                name={readingBadge === "Scanned" ? "scan-circle-outline" : "checkmark-circle-outline"}
                size={14}
                color="#FFFFFF"
              />
              <Text style={styles.verifiedText}>{readingBadge}</Text>
            </View>
          </View>
          <View style={styles.odometerValueRow}>
            <Text style={styles.odometerValue}>{formattedOdometer}</Text>
            <Text style={styles.odometerUnit}>km</Text>
          </View>
          <View style={styles.monthRow}>
            <Ionicons name="flash" size={17} color="#FDE68A" />
            <Text style={styles.monthText}>+{vehicle.dailyCommute} km daily target</Text>
            <View style={styles.commuteDivider} />
            <Text style={styles.commuteText}>Daily commute</Text>
          </View>
        </LinearGradient>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Maintenance health</Text>
            <Text style={styles.sectionCaption}>Based on your service intervals</Text>
          </View>
          <Pressable hitSlop={10} onPress={() => setSheet("maintenance")}>
            <Text style={styles.seeAllText}>View details</Text>
          </Pressable>
        </View>

        <View style={styles.healthRow}>
          <HealthCard
            title={`Engine oil (${vehicle.oilType})`}
            subtitle={
              oilHealth.overdue
                ? "Oil change due"
                : oilHealth.limitingFactor === "time"
                  ? `${oilHealth.remainingDays} days remaining`
                  : `${oilHealth.remaining} km remaining`
            }
            value={oilHealth.percent}
            accent={healthColor(oilHealth.percent)}
            icon="water-outline"
          />
          <HealthCard
            title="Chain lube & clean"
            subtitle={chainHealth.overdue ? "Service overdue" : `${chainHealth.remaining} km remaining`}
            value={chainHealth.percent}
            accent={healthColor(chainHealth.percent)}
            icon="link-outline"
          />
        </View>

        <Text style={[styles.sectionTitle, styles.actionsTitle]}>Quick actions</Text>
        <View style={styles.actionRow}>
          <Pressable
            style={({ pressed }) => [styles.scanButton, pressed && styles.pressed]}
            onPress={() => setScannerMode("odometer")}
          >
            <LinearGradient
              colors={["#3182F6", "#1765D8"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.actionGradient}
            >
              <View style={styles.actionIconLight}>
                <Ionicons name="scan-outline" size={24} color="#FFFFFF" />
              </View>
              <Text style={styles.actionTitle}>Scan odometer</Text>
              <Text style={styles.actionSubtitle}>Camera, gallery or manual</Text>
            </LinearGradient>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.quickLogButton, pressed && styles.pressed]}
            onPress={() => openLog("oil")}
          >
            <View style={styles.actionIconDark}>
              <Ionicons name="add" size={27} color={COLORS.cyan} />
            </View>
            <Text style={styles.actionTitle}>Log oil</Text>
            <Text style={styles.actionSubtitle}>Record an oil change</Text>
          </Pressable>
        </View>

        <Pressable
          style={({ pressed }) => [styles.fuelButton, pressed && styles.pressed]}
          onPress={() => setScannerMode("fuel")}
        >
          <View style={styles.fuelButtonIcon}>
            <Ionicons name="flame-outline" size={23} color={COLORS.green} />
          </View>
          <View style={styles.fuelButtonCopy}>
            <Text style={styles.actionTitle}>Add fuel refill</Text>
            <Text style={styles.actionSubtitle}>Scan pump display, upload image or enter manually</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={COLORS.muted} />
        </Pressable>

        <View style={[styles.sectionHeader, styles.logsHeader]}>
          <Text style={styles.sectionTitle}>Recent activity</Text>
          <View style={styles.activityHeaderActions}>
            <Pressable style={styles.addLogButton} onPress={() => openLog("service")} hitSlop={6}>
              <Ionicons name="add" size={16} color={COLORS.cyan} />
              <Text style={styles.addLogText}>Add log</Text>
            </Pressable>
            <Pressable hitSlop={10} onPress={() => setSheet("activity")}>
              <Text style={styles.seeAllText}>See all</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.logsCard}>
          {vehicle.logs.length ? (
            vehicle.logs.slice(0, 3).map((log) => (
              <ActivityRow key={log.id} log={log} compact />
            ))
          ) : (
            <Pressable style={styles.emptyLogs} onPress={() => openLog("service")}>
              <Ionicons name="add-circle-outline" size={25} color={COLORS.cyan} />
              <Text style={styles.emptyLogsText}>Add your first service log</Text>
            </Pressable>
          )}
        </View>

        <Pressable style={styles.nextServiceCard} onPress={() => setSheet("maintenance")}>
          <View style={styles.calendarIcon}>
            <Ionicons name="calendar-outline" size={20} color={COLORS.cyan} />
          </View>
          <View style={styles.nextServiceCopy}>
            <Text style={styles.nextServiceLabel}>NEXT RECOMMENDED SERVICE</Text>
            <Text style={styles.nextServiceValue}>
              {oilIsTimeLimited ? `Oil by ${nextOilDate}` : `At ${nextServiceAt} km`}
            </Text>
          </View>
          <Text style={styles.nextServiceDistance}>
            {oilIsTimeLimited ? `${oilHealth.remainingDays} days left` : `${nextServiceDistance} km left`}
          </Text>
        </Pressable>
      </ScrollView>

      <GarageSheet
        visible={sheet === "garage"}
        vehicles={garage.vehicles}
        activeId={vehicle.id}
        onClose={() => setSheet(null)}
        onSelect={(id) => {
          selectVehicle(id);
          setSheet(null);
        }}
        onAdd={() => {
          setEditingVehicle(undefined);
          setSheet("vehicle-form");
        }}
        onEdit={(target) => {
          setEditingVehicle(target);
          setSheet("vehicle-form");
        }}
        onDelete={confirmDeleteVehicle}
        accountEmail={user?.email}
        syncLabel={syncMeta.label}
        syncColor={syncMeta.color}
        onSync={() => retrySync()}
        onSignOut={confirmSignOut}
      />
      <VehicleFormSheet
        key={`${editingVehicle?.id ?? "new-vehicle"}-${sheet === "vehicle-form"}`}
        visible={sheet === "vehicle-form"}
        vehicle={editingVehicle}
        onClose={() => setSheet("garage")}
        onSave={handleSaveVehicle}
      />
      <LogSheet
        key={`${vehicle.id}-${logType}-${sheet === "log"}`}
        visible={sheet === "log"}
        vehicle={vehicle}
        initialType={logType}
        onClose={() => setSheet(null)}
        onSave={handleSaveLog}
      />
      <MaintenanceSheet
        visible={sheet === "maintenance"}
        vehicle={vehicle}
        onClose={() => setSheet(null)}
        onLog={openLog}
      />
      <ActivitySheet
        visible={sheet === "activity"}
        vehicle={vehicle}
        onClose={() => setSheet(null)}
      />
      <Modal
        visible={scannerMode === "odometer"}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setScannerMode(null)}
      >
        {scannerMode === "odometer" ? (
          <OdometerScanner
            currentOdometer={vehicle.odometer}
            onScanSuccess={handleScanSuccess}
            onCancel={() => setScannerMode(null)}
          />
        ) : null}
      </Modal>
      <Modal
        visible={scannerMode === "fuel"}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setScannerMode(null)}
      >
        {scannerMode === "fuel" ? (
          <FuelScanner
            currentOdometer={vehicle.odometer}
            onScanSuccess={handleFuelScanSuccess}
            onCancel={() => setScannerMode(null)}
          />
        ) : null}
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  loadingScreen: { alignItems: "center", justifyContent: "center" },
  loadingText: { marginTop: 12, color: COLORS.muted, fontSize: 12 },
  scrollView: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 40 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 22,
  },
  headerControl: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 11,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  headerControlText: { color: "#C8D1DE", fontSize: 10, fontWeight: "700" },
  vehicleInfo: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 5,
  },
  vehicleTitle: { flexShrink: 1, color: COLORS.text, fontSize: 13, fontWeight: "700" },
  onlinePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "#10271F",
    borderWidth: 1,
    borderColor: "#1B4436",
  },
  onlineText: { color: "#7CE9BD", fontSize: 10, fontWeight: "700" },
  odometerCard: {
    minHeight: 210,
    padding: 22,
    borderRadius: 24,
    overflow: "hidden",
    shadowColor: COLORS.blue,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 10,
  },
  glowOne: {
    position: "absolute",
    width: 190,
    height: 190,
    top: -100,
    right: -35,
    borderRadius: 100,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  glowTwo: {
    position: "absolute",
    width: 130,
    height: 130,
    bottom: -85,
    left: 60,
    borderRadius: 70,
    backgroundColor: "rgba(70,220,255,0.14)",
  },
  cardTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  odometerLabel: { color: "#D5E9FF", fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  lastUpdated: { marginTop: 5, color: "rgba(255,255,255,0.64)", fontSize: 11 },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  verifiedText: { color: "#FFFFFF", fontSize: 10, fontWeight: "700" },
  odometerValueRow: { flexDirection: "row", alignItems: "baseline", marginTop: 21 },
  odometerValue: {
    color: "#FFFFFF",
    fontSize: 47,
    lineHeight: 54,
    fontWeight: "800",
    letterSpacing: -1.7,
    fontVariant: ["tabular-nums"],
  },
  odometerUnit: { marginLeft: 8, color: "#C8ECFF", fontSize: 18, fontWeight: "700" },
  monthRow: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: "rgba(5,38,55,0.22)",
  },
  monthText: { color: "#E6F9FF", fontSize: 11, fontWeight: "600" },
  commuteDivider: { width: 1, height: 12, backgroundColor: "rgba(255,255,255,0.28)" },
  commuteText: { color: "#BCE8F5", fontSize: 10, fontWeight: "600" },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: 28,
    marginBottom: 13,
  },
  sectionTitle: { color: COLORS.text, fontSize: 17, fontWeight: "700", letterSpacing: -0.25 },
  sectionCaption: { marginTop: 4, color: COLORS.muted, fontSize: 11 },
  seeAllText: { color: COLORS.cyan, fontSize: 11, fontWeight: "700" },
  healthRow: { gap: 10 },
  healthCard: {
    padding: 15,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  healthTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  healthIcon: { width: 37, height: 37, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  healthCopy: { flex: 1, minWidth: 0, marginHorizontal: 12 },
  healthPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  healthPillText: { fontSize: 11, fontWeight: "800" },
  healthTitle: { color: COLORS.text, fontSize: 13, fontWeight: "700" },
  healthSubtitle: { marginTop: 4, color: COLORS.muted, fontSize: 10 },
  progressTrack: {
    height: 5,
    marginTop: 13,
    overflow: "hidden",
    borderRadius: 4,
    backgroundColor: "#263247",
  },
  progressFill: { height: "100%", borderRadius: 4 },
  actionsTitle: { marginTop: 27, marginBottom: 13 },
  actionRow: { flexDirection: "row", gap: 12 },
  scanButton: { flex: 1, minWidth: 0, borderRadius: 18, overflow: "hidden" },
  actionGradient: { minHeight: 135, padding: 16, justifyContent: "center" },
  quickLogButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 135,
    padding: 16,
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: COLORS.surfaceRaised,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  fuelButton: { minHeight: 73, marginTop: 12, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", borderRadius: 18, backgroundColor: "#10251F", borderWidth: 1, borderColor: "#1E493A" },
  fuelButtonIcon: { width: 43, height: 43, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#12372C" },
  fuelButtonCopy: { flex: 1, minWidth: 0, marginLeft: 12 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
  actionIconLight: {
    width: 42,
    height: 42,
    marginBottom: 13,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  actionIconDark: {
    width: 42,
    height: 42,
    marginBottom: 13,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#12314A",
  },
  actionTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  actionSubtitle: { marginTop: 4, color: "#A9B8CB", fontSize: 10 },
  logsHeader: { marginTop: 28, marginBottom: 12, alignItems: "center" },
  activityHeaderActions: { flexDirection: "row", alignItems: "center", gap: 15 },
  addLogButton: { flexDirection: "row", alignItems: "center", gap: 3 },
  addLogText: { color: COLORS.cyan, fontSize: 11, fontWeight: "700" },
  logsCard: {
    paddingHorizontal: 15,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyLogs: { minHeight: 90, alignItems: "center", justifyContent: "center", gap: 8 },
  emptyLogsText: { color: COLORS.muted, fontSize: 11, fontWeight: "600" },
  logRow: { minHeight: 76, flexDirection: "row", alignItems: "center" },
  logDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#2A3548" },
  logIcon: { width: 39, height: 39, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  logCopy: { flex: 1, minWidth: 0, marginLeft: 12 },
  logTitle: { color: COLORS.text, fontSize: 13, fontWeight: "600" },
  logDate: { marginTop: 4, color: COLORS.muted, fontSize: 10 },
  logDistanceWrap: { flexDirection: "row", alignItems: "center", gap: 4, marginLeft: 8 },
  logDistance: { color: "#C4CEDC", fontSize: 10, fontWeight: "600", fontVariant: ["tabular-nums"] },
  nextServiceCard: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#0C1C2B",
    borderWidth: 1,
    borderColor: "#153850",
  },
  calendarIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#12314A" },
  nextServiceCopy: { flex: 1, marginLeft: 12 },
  nextServiceLabel: { color: COLORS.muted, fontSize: 8, fontWeight: "800", letterSpacing: 0.8 },
  nextServiceValue: { marginTop: 4, color: COLORS.text, fontSize: 13, fontWeight: "700" },
  nextServiceDistance: { color: COLORS.cyan, fontSize: 10, fontWeight: "700" },
});
