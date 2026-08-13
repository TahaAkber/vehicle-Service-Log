import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type {
  LogType,
  OilCategory,
  RidingCondition,
  ServiceLog,
  Vehicle,
  VehicleInput,
} from "../data/vehicleStore";
import {
  getHealth,
  getOilHealth,
  oilCategoryLabel,
  ridingConditionLabel,
} from "../data/vehicleStore";

const C = {
  bg: "#070C18",
  surface: "#111827",
  raised: "#172033",
  border: "#263249",
  text: "#F8FAFC",
  muted: "#8D9AAF",
  blue: "#3182F6",
  cyan: "#52D6FF",
  green: "#36D399",
  amber: "#FFB84D",
  red: "#FF647C",
};

type IconName = React.ComponentProps<typeof Ionicons>["name"];

const oilCategoryOptions: { value: OilCategory; label: string }[] = [
  { value: "mineral", label: "Mineral" },
  { value: "semi-synthetic", label: "Semi-synthetic" },
  { value: "fully-synthetic", label: "Fully synthetic" },
  { value: "other", label: "Other" },
];

const ridingConditionOptions: { value: RidingCondition; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "heavy-traffic", label: "Heavy traffic" },
  { value: "dusty", label: "Dusty roads" },
  { value: "long-distance", label: "Long distance" },
];

function OptionChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.optionChips}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            style={[styles.optionChip, selected && styles.optionChipSelected]}
            onPress={() => onChange(option.value)}
          >
            <Text style={[styles.optionChipText, selected && styles.optionChipTextSelected]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const logMeta: Record<LogType, { label: string; icon: IconName; color: string }> = {
  oil: { label: "Oil change", icon: "water-outline", color: C.blue },
  chain: { label: "Chain service", icon: "link-outline", color: C.amber },
  fuel: { label: "Refuel", icon: "flame-outline", color: C.green },
  service: { label: "Other service", icon: "construct-outline", color: C.cyan },
  odometer: { label: "Odometer", icon: "speedometer-outline", color: C.cyan },
};

export type LogInput = {
  type: Exclude<LogType, "odometer">;
  odometer: number;
  note: string;
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

type SheetProps = {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
};

function Sheet({ visible, title, subtitle, onClose, children }: SheetProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalBackdrop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <SafeAreaView style={styles.sheet} edges={["bottom"]}>
          <View style={styles.handle} />
          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeading}>
              <Text style={styles.sheetTitle}>{title}</Text>
              {subtitle ? <Text style={styles.sheetSubtitle}>{subtitle}</Text> : null}
            </View>
            <Pressable style={styles.closeButton} onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={21} color={C.text} />
            </Pressable>
          </View>
          {children}
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

type GarageSheetProps = {
  visible: boolean;
  vehicles: Vehicle[];
  activeId: string;
  onClose: () => void;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onEdit: (vehicle: Vehicle) => void;
  onDelete: (vehicle: Vehicle) => void;
};

export function GarageSheet({
  visible,
  vehicles,
  activeId,
  onClose,
  onSelect,
  onAdd,
  onEdit,
  onDelete,
}: GarageSheetProps) {
  return (
    <Sheet
      visible={visible}
      title="My garage"
      subtitle={`${vehicles.length} vehicle${vehicles.length === 1 ? "" : "s"}`}
      onClose={onClose}
    >
      <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetContent}>
        {vehicles.map((vehicle) => {
          const selected = vehicle.id === activeId;
          return (
            <Pressable
              key={vehicle.id}
              style={[styles.vehicleRow, selected && styles.vehicleRowSelected]}
              onPress={() => onSelect(vehicle.id)}
            >
              <View style={[styles.vehicleAvatar, selected && styles.vehicleAvatarSelected]}>
                <Ionicons name="bicycle-outline" size={22} color={selected ? C.cyan : C.muted} />
              </View>
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>{vehicle.name}</Text>
                <Text style={styles.rowSubtitle}>{vehicle.odometer.toLocaleString()} km</Text>
              </View>
              {selected ? (
                <View style={styles.activeBadge}>
                  <Text style={styles.activeBadgeText}>ACTIVE</Text>
                </View>
              ) : null}
              <Pressable style={styles.iconButton} onPress={() => onEdit(vehicle)} hitSlop={6}>
                <Ionicons name="pencil-outline" size={17} color={C.muted} />
              </Pressable>
              <Pressable style={styles.iconButton} onPress={() => onDelete(vehicle)} hitSlop={6}>
                <Ionicons name="trash-outline" size={17} color={C.red} />
              </Pressable>
            </Pressable>
          );
        })}

        <Pressable style={styles.addVehicleButton} onPress={onAdd}>
          <View style={styles.addVehicleIcon}>
            <Ionicons name="add" size={23} color={C.cyan} />
          </View>
          <View style={styles.rowCopy}>
            <Text style={styles.addVehicleTitle}>Add another vehicle</Text>
            <Text style={styles.rowSubtitle}>Create a separate service log</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.muted} />
        </Pressable>
      </ScrollView>
    </Sheet>
  );
}

type VehicleFormSheetProps = {
  visible: boolean;
  vehicle?: Vehicle;
  onClose: () => void;
  onSave: (input: VehicleInput) => void;
};

export function VehicleFormSheet({ visible, vehicle, onClose, onSave }: VehicleFormSheetProps) {
  const [name, setName] = useState(vehicle?.name ?? "");
  const [odometer, setOdometer] = useState(String(vehicle?.odometer ?? ""));
  const [dailyCommute, setDailyCommute] = useState(String(vehicle?.dailyCommute ?? 20));
  const [oilCategory, setOilCategory] = useState<OilCategory>(vehicle?.oilCategory ?? "semi-synthetic");
  const [oilBrand, setOilBrand] = useState(vehicle?.oilBrand ?? "");
  const [oilViscosity, setOilViscosity] = useState(vehicle?.oilViscosity ?? "");
  const [oilInterval, setOilInterval] = useState(String(vehicle?.oilInterval ?? 1000));
  const [oilMonths, setOilMonths] = useState(String(vehicle?.oilTimeIntervalMonths ?? 3));
  const [ridingCondition, setRidingCondition] = useState<RidingCondition>(vehicle?.ridingCondition ?? "normal");
  const [chainInterval, setChainInterval] = useState(String(vehicle?.chainInterval ?? 500));

  const submit = () => {
    const parsedOdometer = Number(odometer);
    const parsedCommute = Number(dailyCommute);
    const parsedOilInterval = Number(oilInterval);
    const parsedOilMonths = Number(oilMonths);
    const parsedChainInterval = Number(chainInterval);

    if (!name.trim() || !Number.isFinite(parsedOdometer) || parsedOdometer < 0) {
      Alert.alert("Missing details", "Vehicle name aur valid odometer reading enter karein.");
      return;
    }
    if (parsedOilInterval <= 0 || parsedOilMonths <= 0 || parsedChainInterval <= 0 || parsedCommute < 0) {
      Alert.alert("Invalid interval", "Service intervals zero se greater hone chahiye.");
      return;
    }

    onSave({
      name: name.trim(),
      odometer: Math.round(parsedOdometer),
      dailyCommute: Math.round(parsedCommute),
      oilType: oilCategoryLabel(oilCategory),
      oilCategory,
      oilBrand: oilBrand.trim(),
      oilViscosity: oilViscosity.trim(),
      oilInterval: Math.round(parsedOilInterval),
      oilTimeIntervalMonths: Math.round(parsedOilMonths),
      ridingCondition,
      chainInterval: Math.round(parsedChainInterval),
    });
  };

  return (
    <Sheet
      visible={visible}
      title={vehicle ? "Edit vehicle" : "Add vehicle"}
      subtitle="Maintenance intervals can be changed anytime"
      onClose={onClose}
    >
      <ScrollView
        style={styles.sheetScroll}
        contentContainerStyle={styles.formContent}
        keyboardShouldPersistTaps="handled"
      >
        <Field label="VEHICLE NAME" value={name} onChangeText={setName} placeholder="e.g. Honda Civic 2020" />
        <View style={styles.twoColumns}>
          <Field
            compact
            label="ODOMETER (KM)"
            value={odometer}
            onChangeText={setOdometer}
            keyboardType="numeric"
            placeholder="0"
          />
          <Field
            compact
            label="DAILY COMMUTE"
            value={dailyCommute}
            onChangeText={setDailyCommute}
            keyboardType="numeric"
            placeholder="20"
          />
        </View>
        <Text style={styles.fieldLabel}>OIL CATEGORY</Text>
        <OptionChips
          options={oilCategoryOptions}
          value={oilCategory}
          onChange={setOilCategory}
        />
        <View style={styles.twoColumns}>
          <Field compact label="OIL BRAND (OPTIONAL)" value={oilBrand} onChangeText={setOilBrand} placeholder="e.g. Shell" />
          <Field compact label="VISCOSITY" value={oilViscosity} onChangeText={setOilViscosity} placeholder="e.g. 20W-40" autoCapitalize="characters" />
        </View>
        <View style={styles.twoColumns}>
          <Field
            compact
            label="CHANGE EVERY (KM)"
            value={oilInterval}
            onChangeText={setOilInterval}
            keyboardType="numeric"
            placeholder="1000"
          />
          <Field
            compact
            label="MAX AGE (MONTHS)"
            value={oilMonths}
            onChangeText={setOilMonths}
            keyboardType="numeric"
            placeholder="3"
          />
        </View>
        <Text style={styles.manualIntervalHint}>Aapka entered KM interval final hai. Category is value ko override nahi karegi.</Text>
        <Text style={styles.fieldLabel}>RIDING CONDITION</Text>
        <OptionChips
          options={ridingConditionOptions}
          value={ridingCondition}
          onChange={setRidingCondition}
        />
        <Text style={styles.conditionHint}>Riding condition record hoti hai; health calculation aapke exact KM/month limits ko follow karti hai.</Text>
        <Field
          label="CHAIN SERVICE INTERVAL (KM)"
          value={chainInterval}
          onChangeText={setChainInterval}
          keyboardType="numeric"
          placeholder="500"
        />
        <Pressable style={styles.primaryButton} onPress={submit}>
          <Ionicons name={vehicle ? "checkmark" : "add"} size={20} color="#FFFFFF" />
          <Text style={styles.primaryButtonText}>{vehicle ? "Save changes" : "Add to garage"}</Text>
        </Pressable>
      </ScrollView>
    </Sheet>
  );
}

type FieldProps = React.ComponentProps<typeof TextInput> & {
  label: string;
  compact?: boolean;
};

function Field({ label, compact, ...inputProps }: FieldProps) {
  return (
    <View style={[styles.field, compact && styles.compactField]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...inputProps}
        style={styles.input}
        placeholderTextColor="#556379"
        selectionColor={C.cyan}
      />
    </View>
  );
}

type LogSheetProps = {
  visible: boolean;
  vehicle: Vehicle;
  initialType: Exclude<LogType, "odometer">;
  onClose: () => void;
  onSave: (input: LogInput) => void;
};

export function LogSheet({ visible, vehicle, initialType, onClose, onSave }: LogSheetProps) {
  const [type, setType] = useState<Exclude<LogType, "odometer">>(initialType);
  const [odometer, setOdometer] = useState(String(vehicle.odometer));
  const [liters, setLiters] = useState("");
  const [amount, setAmount] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [fullTank, setFullTank] = useState(false);
  const [note, setNote] = useState("");
  const [oilCategory, setOilCategory] = useState<OilCategory>(vehicle.oilCategory);
  const [oilBrand, setOilBrand] = useState(vehicle.oilBrand);
  const [oilViscosity, setOilViscosity] = useState(vehicle.oilViscosity);
  const [oilInterval, setOilInterval] = useState(String(vehicle.oilInterval));
  const [oilMonths, setOilMonths] = useState(String(vehicle.oilTimeIntervalMonths));
  const [ridingCondition, setRidingCondition] = useState<RidingCondition>(vehicle.ridingCondition);

  const submit = () => {
    const parsedOdometer = Number(odometer);
    let parsedLiters = Number(liters);
    let parsedAmount = Number(amount);
    let parsedRate = Number(unitPrice);
    const parsedOilInterval = Number(oilInterval);
    const parsedOilMonths = Number(oilMonths);
    if (!Number.isFinite(parsedOdometer) || parsedOdometer < 0) {
      Alert.alert("Invalid odometer", "Valid kilometer reading enter karein.");
      return;
    }
    if (type === "fuel") {
      const hasLiters = Number.isFinite(parsedLiters) && parsedLiters > 0;
      const hasAmount = Number.isFinite(parsedAmount) && parsedAmount > 0;
      const hasRate = Number.isFinite(parsedRate) && parsedRate > 0;
      if ([hasLiters, hasAmount, hasRate].filter(Boolean).length < 2) {
        Alert.alert("More details needed", "Amount, liters aur rate mein se kam az kam do values enter karein.");
        return;
      }
      if (!hasLiters) parsedLiters = parsedAmount / parsedRate;
      if (!hasAmount) parsedAmount = parsedLiters * parsedRate;
      if (!hasRate) parsedRate = parsedAmount / parsedLiters;
    }
    if (type === "service" && !note.trim()) {
      Alert.alert("Service details", "Service ka short description enter karein.");
      return;
    }
    if (type === "oil" && (parsedOilInterval <= 0 || parsedOilMonths <= 0)) {
      Alert.alert("Invalid oil interval", "Kilometer interval aur maximum months zero se greater hone chahiye.");
      return;
    }
    onSave({
      type,
      odometer: Math.round(parsedOdometer),
      liters: type === "fuel" ? parsedLiters : undefined,
      amount: type === "fuel" ? Number(parsedAmount.toFixed(2)) : undefined,
      unitPrice: type === "fuel" ? Number(parsedRate.toFixed(2)) : undefined,
      fullTank: type === "fuel" ? fullTank : undefined,
      source: "manual",
      note: note.trim(),
      oilCategory: type === "oil" ? oilCategory : undefined,
      oilBrand: type === "oil" ? oilBrand.trim() : undefined,
      oilViscosity: type === "oil" ? oilViscosity.trim() : undefined,
      oilInterval: type === "oil" ? Math.round(parsedOilInterval) : undefined,
      oilTimeIntervalMonths: type === "oil" ? Math.round(parsedOilMonths) : undefined,
      ridingCondition: type === "oil" ? ridingCondition : undefined,
    });
  };

  return (
    <Sheet visible={visible} title="Add service log" subtitle={vehicle.name} onClose={onClose}>
      <ScrollView
        style={styles.sheetScroll}
        contentContainerStyle={styles.formContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.fieldLabel}>LOG TYPE</Text>
        <View style={styles.typeGrid}>
          {(["oil", "chain", "fuel", "service"] as const).map((item) => {
            const meta = logMeta[item];
            const selected = item === type;
            return (
              <Pressable
                key={item}
                style={[styles.typeButton, selected && styles.typeButtonSelected]}
                onPress={() => setType(item)}
              >
                <Ionicons name={meta.icon} size={18} color={selected ? C.cyan : C.muted} />
                <Text style={[styles.typeButtonText, selected && styles.typeButtonTextSelected]}>
                  {meta.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Field
          label="ODOMETER READING (KM)"
          value={odometer}
          onChangeText={setOdometer}
          keyboardType="numeric"
        />
        {type === "oil" ? (
          <>
            <Text style={styles.fieldLabel}>NEW OIL CATEGORY</Text>
            <OptionChips options={oilCategoryOptions} value={oilCategory} onChange={setOilCategory} />
            <View style={styles.twoColumns}>
              <Field compact label="OIL BRAND (OPTIONAL)" value={oilBrand} onChangeText={setOilBrand} placeholder="e.g. Shell" />
              <Field compact label="VISCOSITY" value={oilViscosity} onChangeText={setOilViscosity} placeholder="e.g. 20W-40" autoCapitalize="characters" />
            </View>
            <View style={styles.twoColumns}>
              <Field compact label="CHANGE EVERY (KM)" value={oilInterval} onChangeText={setOilInterval} keyboardType="numeric" placeholder="1000" />
              <Field compact label="MAX AGE (MONTHS)" value={oilMonths} onChangeText={setOilMonths} keyboardType="numeric" placeholder="3" />
            </View>
            <Text style={styles.manualIntervalHint}>Example: 1,000 km set karne par countdown isi exact interval se reset hoga.</Text>
            <Text style={styles.fieldLabel}>RIDING CONDITION</Text>
            <OptionChips options={ridingConditionOptions} value={ridingCondition} onChange={setRidingCondition} />
            <Text style={styles.conditionHint}>Condition reference ke liye save hogi; custom interval automatically reduce nahi hoga.</Text>
          </>
        ) : null}
        {type === "fuel" ? (
          <>
            <Field
              label="TOTAL AMOUNT (RS)"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="e.g. 2000"
            />
            <View style={styles.twoColumns}>
              <Field
                compact
                label="FUEL (LITERS)"
                value={liters}
                onChangeText={setLiters}
                keyboardType="decimal-pad"
                placeholder="e.g. 7.81"
              />
              <Field
                compact
                label="RATE / LITER"
                value={unitPrice}
                onChangeText={setUnitPrice}
                keyboardType="decimal-pad"
                placeholder="e.g. 256.13"
              />
            </View>
            <Pressable style={styles.fullTankRow} onPress={() => setFullTank((value) => !value)}>
              <View style={[styles.checkbox, fullTank && styles.checkboxActive]}>
                {fullTank ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}
              </View>
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>Full tank refill</Text>
                <Text style={styles.rowSubtitle}>Fuel average calculation ke liye</Text>
              </View>
            </Pressable>
            <Text style={styles.fuelHint}>Koi bhi do values enter karein; third automatically calculate ho jayegi.</Text>
          </>
        ) : null}
        <Field
          label={type === "service" ? "SERVICE DETAILS" : "NOTE (OPTIONAL)"}
          value={note}
          onChangeText={setNote}
          placeholder={type === "service" ? "e.g. Brake pads replaced" : "Add a note"}
        />
        <Pressable style={styles.primaryButton} onPress={submit}>
          <Ionicons name="checkmark-circle-outline" size={20} color="#FFFFFF" />
          <Text style={styles.primaryButtonText}>Save log</Text>
        </Pressable>
      </ScrollView>
    </Sheet>
  );
}

type MaintenanceSheetProps = {
  visible: boolean;
  vehicle: Vehicle;
  onClose: () => void;
  onLog: (type: "oil" | "chain") => void;
};

export function MaintenanceSheet({ visible, vehicle, onClose, onLog }: MaintenanceSheetProps) {
  const oil = getOilHealth(vehicle);
  const chain = getHealth(vehicle.odometer, vehicle.chainLastServiced, vehicle.chainInterval);

  return (
    <Sheet visible={visible} title="Maintenance details" subtitle={vehicle.name} onClose={onClose}>
      <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetContent}>
        <MaintenanceDetail
          title={`Engine oil (${vehicle.oilType})`}
          icon="water-outline"
          color={oil.percent > 50 ? C.green : oil.percent > 20 ? C.amber : C.red}
          percent={oil.percent}
          remaining={oil.remaining}
          remainingDays={oil.remainingDays}
          interval={vehicle.oilInterval}
          timeIntervalMonths={vehicle.oilTimeIntervalMonths}
          lastService={vehicle.oilLastChanged}
          lastServiceDate={vehicle.oilLastChangedAt}
          detail={[vehicle.oilBrand, vehicle.oilViscosity, ridingConditionLabel(vehicle.ridingCondition)]
            .filter(Boolean)
            .join(" • ")}
          onLog={() => onLog("oil")}
        />
        <MaintenanceDetail
          title="Chain lube & clean"
          icon="link-outline"
          color={chain.percent > 50 ? C.green : chain.percent > 20 ? C.amber : C.red}
          percent={chain.percent}
          remaining={chain.remaining}
          interval={vehicle.chainInterval}
          lastService={vehicle.chainLastServiced}
          onLog={() => onLog("chain")}
        />
      </ScrollView>
    </Sheet>
  );
}

type MaintenanceDetailProps = {
  title: string;
  icon: IconName;
  color: string;
  percent: number;
  remaining: number;
  remainingDays?: number;
  interval: number;
  timeIntervalMonths?: number;
  lastService: number;
  lastServiceDate?: string;
  detail?: string;
  onLog: () => void;
};

function MaintenanceDetail(props: MaintenanceDetailProps) {
  return (
    <View style={styles.maintenanceCard}>
      <View style={styles.maintenanceTop}>
        <View style={[styles.maintenanceIcon, { backgroundColor: `${props.color}18` }]}>
          <Ionicons name={props.icon} size={22} color={props.color} />
        </View>
        <View style={styles.rowCopy}>
          <Text style={styles.rowTitle}>{props.title}</Text>
          <Text style={styles.rowSubtitle}>
            {props.remaining} km{props.remainingDays !== undefined ? ` • ${props.remainingDays} days` : ""} remaining
          </Text>
          {props.detail ? <Text style={styles.maintenanceDetailText}>{props.detail}</Text> : null}
        </View>
        <Text style={[styles.maintenancePercent, { color: props.color }]}>{props.percent}%</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${props.percent}%`, backgroundColor: props.color }]} />
      </View>
      <View style={styles.maintenanceStats}>
        <View>
          <Text style={styles.statLabel}>LAST SERVICE</Text>
          <Text style={styles.statValue}>{props.lastService.toLocaleString()} km</Text>
          {props.lastServiceDate ? (
            <Text style={styles.statDate}>
              {new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(props.lastServiceDate))}
            </Text>
          ) : null}
        </View>
        <View>
          <Text style={styles.statLabel}>INTERVAL</Text>
          <Text style={styles.statValue}>
            {props.interval.toLocaleString()} km{props.timeIntervalMonths ? ` / ${props.timeIntervalMonths} mo` : ""}
          </Text>
        </View>
        <Pressable style={styles.smallButton} onPress={props.onLog}>
          <Text style={styles.smallButtonText}>Log now</Text>
        </Pressable>
      </View>
    </View>
  );
}

type ActivitySheetProps = {
  visible: boolean;
  vehicle: Vehicle;
  onClose: () => void;
};

export function ActivitySheet({ visible, vehicle, onClose }: ActivitySheetProps) {
  return (
    <Sheet
      visible={visible}
      title="Activity history"
      subtitle={`${vehicle.logs.length} saved entries`}
      onClose={onClose}
    >
      <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetContent}>
        {vehicle.logs.length ? (
          vehicle.logs.map((log) => <ActivityRow key={log.id} log={log} />)
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={34} color={C.muted} />
            <Text style={styles.emptyTitle}>No activity yet</Text>
            <Text style={styles.emptyCopy}>Your service and odometer logs will appear here.</Text>
          </View>
        )}
      </ScrollView>
    </Sheet>
  );
}

export function ActivityRow({ log, compact = false }: { log: ServiceLog; compact?: boolean }) {
  const meta = logMeta[log.type];
  const date = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(log.date));

  const showDetails = () =>
    Alert.alert(
      log.title,
      [`Date: ${date}`, `Odometer: ${log.odometer.toLocaleString()} km`, log.note]
        .concat(log.amount ? [`Amount: Rs ${log.amount.toLocaleString()}`] : [])
        .concat(log.liters ? [`Petrol: ${log.liters} liters`] : [])
        .concat(log.unitPrice ? [`Rate: Rs ${log.unitPrice}/L`] : [])
        .concat(log.oilCategory ? [`Oil: ${oilCategoryLabel(log.oilCategory)}`] : [])
        .concat(log.oilBrand ? [`Brand: ${log.oilBrand}`] : [])
        .concat(log.oilViscosity ? [`Viscosity: ${log.oilViscosity}`] : [])
        .concat(log.oilInterval ? [`Change interval: ${log.oilInterval.toLocaleString()} km`] : [])
        .concat(log.oilTimeIntervalMonths ? [`Maximum age: ${log.oilTimeIntervalMonths} months`] : [])
        .filter(Boolean)
        .join("\n"),
    );

  return (
    <Pressable style={[styles.activityRow, compact && styles.activityRowCompact]} onPress={showDetails}>
      <View style={[styles.activityIcon, { backgroundColor: `${meta.color}18` }]}>
        <Ionicons name={meta.icon} size={20} color={meta.color} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{log.title}</Text>
        <Text style={styles.rowSubtitle}>{date}</Text>
      </View>
      <Text style={styles.activityDistance}>{log.odometer.toLocaleString()} km</Text>
      <Ionicons name="chevron-forward" size={15} color="#526078" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.64)" },
  sheet: {
    maxHeight: "91%",
    minHeight: 310,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: C.border,
    overflow: "hidden",
  },
  handle: { alignSelf: "center", width: 42, height: 4, marginTop: 10, borderRadius: 3, backgroundColor: "#344157" },
  sheetHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 15, paddingBottom: 13 },
  sheetHeading: { flex: 1 },
  sheetTitle: { color: C.text, fontSize: 20, fontWeight: "800", letterSpacing: -0.4 },
  sheetSubtitle: { marginTop: 4, color: C.muted, fontSize: 11 },
  closeButton: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: C.surface },
  sheetScroll: { flexGrow: 0 },
  sheetContent: { padding: 20, paddingTop: 6, paddingBottom: 28, gap: 10 },
  formContent: { padding: 20, paddingTop: 6, paddingBottom: 36 },
  vehicleRow: { flexDirection: "row", alignItems: "center", minHeight: 72, padding: 12, borderRadius: 16, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  vehicleRowSelected: { borderColor: "#225A78", backgroundColor: "#0D2130" },
  vehicleAvatar: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: C.raised },
  vehicleAvatarSelected: { backgroundColor: "#123A52" },
  rowCopy: { flex: 1, minWidth: 0, marginLeft: 11 },
  rowTitle: { color: C.text, fontSize: 13, fontWeight: "700" },
  rowSubtitle: { marginTop: 4, color: C.muted, fontSize: 10 },
  activeBadge: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 7, backgroundColor: "#123D31" },
  activeBadgeText: { color: C.green, fontSize: 8, fontWeight: "900", letterSpacing: 0.5 },
  iconButton: { width: 32, height: 34, marginLeft: 3, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  addVehicleButton: { flexDirection: "row", alignItems: "center", minHeight: 68, marginTop: 5, padding: 12, borderRadius: 16, borderWidth: 1, borderStyle: "dashed", borderColor: "#285273" },
  addVehicleIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#102A3E" },
  addVehicleTitle: { color: C.cyan, fontSize: 13, fontWeight: "700" },
  field: { marginBottom: 15 },
  compactField: { flex: 1, minWidth: 0 },
  fieldLabel: { marginBottom: 7, color: C.muted, fontSize: 9, fontWeight: "800", letterSpacing: 0.8 },
  optionChips: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 15 },
  optionChip: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  optionChipSelected: { backgroundColor: "#102A3E", borderColor: "#286188" },
  optionChipText: { color: C.muted, fontSize: 9, fontWeight: "700" },
  optionChipTextSelected: { color: C.cyan },
  manualIntervalHint: { marginTop: -7, marginBottom: 15, color: C.cyan, fontSize: 9, lineHeight: 14 },
  conditionHint: { marginTop: -8, marginBottom: 15, color: C.muted, fontSize: 8, lineHeight: 13 },
  input: { height: 48, paddingHorizontal: 13, borderRadius: 13, color: C.text, fontSize: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  twoColumns: { flexDirection: "row", gap: 11 },
  fullTankRow: { flexDirection: "row", alignItems: "center", marginBottom: 6, padding: 12, borderRadius: 13, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  checkbox: { width: 23, height: 23, borderRadius: 7, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#526078" },
  checkboxActive: { backgroundColor: C.blue, borderColor: C.blue },
  fuelHint: { marginBottom: 15, color: C.muted, fontSize: 9, lineHeight: 14 },
  primaryButton: { minHeight: 50, marginTop: 8, borderRadius: 14, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", backgroundColor: C.blue },
  primaryButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 17 },
  typeButton: { width: "48%", flexGrow: 1, minHeight: 48, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 11, borderRadius: 13, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  typeButtonSelected: { backgroundColor: "#102A3E", borderColor: "#286188" },
  typeButtonText: { color: C.muted, fontSize: 11, fontWeight: "700" },
  typeButtonTextSelected: { color: C.text },
  maintenanceCard: { padding: 16, borderRadius: 18, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  maintenanceTop: { flexDirection: "row", alignItems: "center" },
  maintenanceIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  maintenancePercent: { fontSize: 17, fontWeight: "900" },
  maintenanceDetailText: { marginTop: 3, color: C.muted, fontSize: 8 },
  progressTrack: { height: 6, marginTop: 16, overflow: "hidden", borderRadius: 4, backgroundColor: "#263247" },
  progressFill: { height: "100%", borderRadius: 4 },
  maintenanceStats: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 16 },
  statLabel: { color: C.muted, fontSize: 8, fontWeight: "800", letterSpacing: 0.6 },
  statValue: { marginTop: 4, color: C.text, fontSize: 11, fontWeight: "700" },
  statDate: { marginTop: 2, color: C.muted, fontSize: 8 },
  smallButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: "#173A53" },
  smallButtonText: { color: C.cyan, fontSize: 10, fontWeight: "800" },
  activityRow: { minHeight: 72, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, borderRadius: 15, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  activityRowCompact: { minHeight: 76, paddingHorizontal: 0, borderRadius: 0, borderWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border, backgroundColor: "transparent" },
  activityIcon: { width: 39, height: 39, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  activityDistance: { marginLeft: 7, color: "#C4CEDC", fontSize: 10, fontWeight: "700" },
  emptyState: { alignItems: "center", paddingVertical: 45 },
  emptyTitle: { marginTop: 13, color: C.text, fontSize: 15, fontWeight: "700" },
  emptyCopy: { maxWidth: 240, marginTop: 6, color: C.muted, fontSize: 11, textAlign: "center", lineHeight: 17 },
});
