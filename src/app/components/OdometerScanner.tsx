import { Ionicons } from "@expo/vector-icons";
import TextRecognition, {
  type TextRecognitionResult,
} from "@react-native-ml-kit/text-recognition";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { StatusBar } from "expo-status-bar";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export type ScanSource = "camera" | "gallery" | "manual";

export type FuelScanResult = {
  odometer: number;
  amount: number;
  liters: number;
  unitPrice: number;
  fullTank: boolean;
  source: ScanSource;
};

type ScannerMode = "odometer" | "fuel";
type ScannerStep = "choose" | "camera" | "confirm";

type SmartScannerProps = {
  mode: ScannerMode;
  currentOdometer: number;
  onOdometerSuccess?: (reading: number, source: ScanSource) => void;
  onFuelSuccess?: (result: FuelScanResult) => void;
  onCancel: () => void;
};

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

const cleanNumber = (value: string) =>
  Number(value.replace(/[^\d.,]/g, "").replace(/,/g, ""));

const extractNumbers = (text: string) =>
  (text.match(/\d[\d,.]*/g) ?? [])
    .map(cleanNumber)
    .filter((value) => Number.isFinite(value) && value >= 0);

function parseOdometer(result: TextRecognitionResult, current: number) {
  const lines = result.blocks
    .flatMap((block) => block.lines)
    .map((line) => ({ text: line.text, top: line.frame?.top ?? 99999 }))
    .sort((a, b) => a.top - b.top);

  const candidates = lines.flatMap((line, lineIndex) =>
    (line.text.match(/\d[\d\s,.]{2,}\d|\d{3,7}/g) ?? []).flatMap((token) => {
      const digits = token.replace(/\D/g, "");
      const rawValue = Number(digits);
      const values = digits.length === 6 ? [rawValue / 10, rawValue] : [rawValue];
      return values.map((value, variantIndex) => {
        let score = digits.length >= 4 && digits.length <= 7 ? 6 : 0;
        score += Math.max(0, 4 - lineIndex);
        if (value >= current && value - current <= 5000) score += 6;
        if (value < current) score -= 5;
        if (current > 0 && value > current * 5) score -= 6;
        if (/km|odo/i.test(line.text)) score += 5;
        if (digits.length === 6 && variantIndex === 0) score += 2;
        if (value > 9999999 || value < 1) score -= 8;
        return { value: Number(value.toFixed(1)), score };
      });
    }),
  );

  return candidates.sort((a, b) => b.score - a.score)[0]?.value;
}

function valueNearKeywords(result: TextRecognitionResult, keywords: RegExp) {
  const lines = result.blocks.flatMap((block) => block.lines.map((line) => line.text));
  for (let index = 0; index < lines.length; index += 1) {
    if (!keywords.test(lines[index])) continue;
    const own = extractNumbers(lines[index]);
    if (own.length) return own[own.length - 1];
    const next = extractNumbers(lines[index + 1] ?? "");
    if (next.length) return next[0];
  }
  return undefined;
}

function parseFuel(result: TextRecognitionResult) {
  let amount = valueNearKeywords(result, /amount|sale|total|rs\.?|pkr/i);
  let liters = valueNearKeywords(result, /lit(?:er|re)?s?|volume|qty|quantity/i);
  let unitPrice = valueNearKeywords(result, /rate|unit\s*price|price\s*\/\s*l/i);

  const all = extractNumbers(result.text).filter((value) => value > 0);
  if (!amount) amount = all.find((value) => value >= 100);
  if (!liters) liters = all.find((value) => value > 0 && value < 100);
  if (!unitPrice) {
    unitPrice = all.find((value) => value >= 100 && value < 1000 && value !== amount);
  }

  if (!liters && amount && unitPrice) liters = amount / unitPrice;
  if (!amount && liters && unitPrice) amount = liters * unitPrice;
  if (!unitPrice && amount && liters) unitPrice = amount / liters;

  return { amount, liters, unitPrice };
}

export function OdometerScanner({
  currentOdometer,
  onScanSuccess,
  onCancel,
}: {
  currentOdometer: number;
  onScanSuccess: (reading: number, source: ScanSource) => void;
  onCancel: () => void;
}) {
  return (
    <SmartScanner
      mode="odometer"
      currentOdometer={currentOdometer}
      onOdometerSuccess={onScanSuccess}
      onCancel={onCancel}
    />
  );
}

export function FuelScanner({
  currentOdometer,
  onScanSuccess,
  onCancel,
}: {
  currentOdometer: number;
  onScanSuccess: (result: FuelScanResult) => void;
  onCancel: () => void;
}) {
  return (
    <SmartScanner
      mode="fuel"
      currentOdometer={currentOdometer}
      onFuelSuccess={onScanSuccess}
      onCancel={onCancel}
    />
  );
}

function SmartScanner({
  mode,
  currentOdometer,
  onOdometerSuccess,
  onFuelSuccess,
  onCancel,
}: SmartScannerProps) {
  const [step, setStep] = useState<ScannerStep>("choose");
  const [source, setSource] = useState<ScanSource>("manual");
  const [isProcessing, setIsProcessing] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [odometer, setOdometer] = useState(String(currentOdometer));
  const [amount, setAmount] = useState("");
  const [liters, setLiters] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [fullTank, setFullTank] = useState(false);

  const title = mode === "odometer" ? "Add odometer reading" : "Add petrol refill";

  const processImage = async (uri: string, nextSource: ScanSource) => {
    try {
      setIsProcessing(true);
      const result = await TextRecognition.recognize(uri);
      setSource(nextSource);

      if (mode === "odometer") {
        const detected = parseOdometer(result, currentOdometer);
        if (detected !== undefined) setOdometer(String(detected));
        else Alert.alert("Reading unclear", "OCR reading detect nahi kar saka. Manual value enter karein.");
      } else {
        const detected = parseFuel(result);
        if (detected.amount) setAmount(detected.amount.toFixed(2));
        if (detected.liters) setLiters(detected.liters.toFixed(3));
        if (detected.unitPrice) setUnitPrice(detected.unitPrice.toFixed(2));
        if (!detected.amount && !detected.liters && !detected.unitPrice) {
          Alert.alert("Pump values unclear", "Image process hui, lekin values clear nahi thin. Neeche manually correct karein.");
        }
      }
      setStep("confirm");
    } catch (error) {
      console.error("OCR error", error);
      Alert.alert("Could not read image", "Clear image ke saath dobara try karein ya manual entry use karein.");
    } finally {
      setIsProcessing(false);
    }
  };

  const chooseGallery = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert(
        "Gallery access needed",
        "Local image select karne ke liye photo library access allow karein.",
        [
          { text: "Cancel", style: "cancel" },
          ...(permissionResult.canAskAgain
            ? []
            : [{ text: "Open settings", onPress: Linking.openSettings }]),
        ],
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 1,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      await processImage(result.assets[0].uri, "gallery");
    }
  };

  const openCamera = async () => {
    if (!permission) return;
    if (!permission.granted) {
      if (!permission.canAskAgain) {
        setStep("camera");
        return;
      }
      const next = await requestPermission();
      if (!next.granted) {
        setStep("camera");
        return;
      }
    }
    setStep("camera");
  };

  const capture = async () => {
    if (!cameraRef.current || isProcessing) return;
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.9, skipProcessing: false });
    if (photo?.uri) await processImage(photo.uri, "camera");
  };

  const useManual = () => {
    setSource("manual");
    if (mode === "fuel") {
      setAmount("");
      setLiters("");
      setUnitPrice("");
    }
    setStep("confirm");
  };

  const submit = () => {
    const parsedOdometer = cleanNumber(odometer);
    if (!Number.isFinite(parsedOdometer) || parsedOdometer < 0) {
      Alert.alert("Invalid odometer", "Valid odometer reading enter karein.");
      return;
    }

    if (mode === "odometer") {
      if (parsedOdometer < currentOdometer) {
        Alert.alert(
          "Reading cannot decrease",
          `Current saved odometer ${currentOdometer.toLocaleString()} km hai. Reading correct karke dobara save karein.`,
        );
        return;
      }
      onOdometerSuccess?.(Number(parsedOdometer.toFixed(1)), source);
      return;
    }

    let parsedAmount = cleanNumber(amount);
    let parsedLiters = cleanNumber(liters);
    let parsedRate = cleanNumber(unitPrice);
    const hasAmount = Number.isFinite(parsedAmount) && parsedAmount > 0;
    const hasLiters = Number.isFinite(parsedLiters) && parsedLiters > 0;
    const hasRate = Number.isFinite(parsedRate) && parsedRate > 0;

    if ([hasAmount, hasLiters, hasRate].filter(Boolean).length < 2) {
      Alert.alert("More details needed", "Amount, liters aur rate mein se kam az kam do values enter karein.");
      return;
    }
    if (!hasLiters) parsedLiters = parsedAmount / parsedRate;
    if (!hasAmount) parsedAmount = parsedLiters * parsedRate;
    if (!hasRate) parsedRate = parsedAmount / parsedLiters;

    onFuelSuccess?.({
      odometer: Number(parsedOdometer.toFixed(1)),
      amount: Number(parsedAmount.toFixed(2)),
      liters: Number(parsedLiters.toFixed(3)),
      unitPrice: Number(parsedRate.toFixed(2)),
      fullTank,
      source,
    });
  };

  if (step === "camera") {
    if (!permission?.granted) {
      return (
        <SafeAreaView style={styles.centered}>
          <StatusBar style="light" />
          <Ionicons name="camera-outline" size={40} color={C.cyan} />
          <Text style={styles.permissionTitle}>Camera access needed</Text>
          <Text style={styles.permissionText}>Photo scan karne ke liye camera permission required hai.</Text>
          <View style={styles.permissionActions}>
            <Pressable style={styles.secondaryButton} onPress={() => setStep("choose")}>
              <Text style={styles.secondaryButtonText}>Back</Text>
            </Pressable>
            <Pressable
              style={styles.primarySmall}
              onPress={permission?.canAskAgain ? requestPermission : Linking.openSettings}
            >
              <Text style={styles.primaryButtonText}>{permission?.canAskAgain ? "Allow camera" : "Open settings"}</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      );
    }

    return (
      <View style={styles.cameraContainer}>
        <StatusBar style="light" />
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
        <SafeAreaView style={styles.cameraOverlay}>
          <View style={styles.cameraHeader}>
            <Pressable style={styles.roundButton} onPress={() => setStep("choose")}>
              <Ionicons name="close" size={22} color="#FFFFFF" />
            </Pressable>
            <Text style={styles.cameraTitle}>{mode === "odometer" ? "Frame main odometer window" : "Frame complete pump display"}</Text>
            <View style={styles.roundButtonPlaceholder} />
          </View>
          <View style={[styles.scanFrame, mode === "fuel" && styles.fuelScanFrame]}>
            <View style={styles.cornerTopLeft} />
            <View style={styles.cornerTopRight} />
            <View style={styles.cornerBottomLeft} />
            <View style={styles.cornerBottomRight} />
          </View>
          <View style={styles.captureArea}>
            <Text style={styles.cameraHint}>{mode === "odometer" ? "Total odometer ko clear aur seedha rakhein" : "Amount, liters aur rate screen par visible hon"}</Text>
            <Pressable style={styles.captureOuter} onPress={capture} disabled={isProcessing}>
              {isProcessing ? <ActivityIndicator color="#FFFFFF" /> : <View style={styles.captureInner} />}
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <StatusBar style="light" />
      <View style={styles.topBar}>
        <Pressable style={styles.roundButton} onPress={step === "confirm" ? () => setStep("choose") : onCancel}>
          <Ionicons name={step === "confirm" ? "arrow-back" : "close"} size={21} color={C.text} />
        </Pressable>
        <Text style={styles.topBarTitle}>{title}</Text>
        <View style={styles.roundButtonPlaceholder} />
      </View>

      {isProcessing ? (
        <View style={styles.processing}>
          <ActivityIndicator size="large" color={C.cyan} />
          <Text style={styles.processingTitle}>Reading image…</Text>
          <Text style={styles.processingCopy}>On-device OCR values detect kar raha hai.</Text>
        </View>
      ) : step === "choose" ? (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.heroIcon, { backgroundColor: mode === "fuel" ? "#123D31" : "#102A3E" }]}>
            <Ionicons name={mode === "fuel" ? "flame-outline" : "speedometer-outline"} size={34} color={mode === "fuel" ? C.green : C.cyan} />
          </View>
          <Text style={styles.chooseTitle}>{mode === "fuel" ? "How do you want to add petrol?" : "How do you want to add reading?"}</Text>
          <Text style={styles.chooseCopy}>Photo scan ke baad values confirm aur edit bhi ki ja sakti hain.</Text>
          <MethodButton icon="camera-outline" title="Take a photo" subtitle={mode === "fuel" ? "Scan petrol pump display" : "Scan motorcycle odometer"} onPress={openCamera} />
          <MethodButton icon="images-outline" title="Choose from gallery" subtitle="Use an existing image from your phone" onPress={chooseGallery} />
          <MethodButton icon="keypad-outline" title="Enter manually" subtitle="Use when no image is available" onPress={useManual} />
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
          <View style={styles.detectedBanner}>
            <Ionicons name={source === "manual" ? "create-outline" : "scan-circle-outline"} size={21} color={C.cyan} />
            <View style={styles.bannerCopy}>
              <Text style={styles.bannerTitle}>{source === "manual" ? "Manual entry" : "Review detected values"}</Text>
              <Text style={styles.bannerSubtitle}>{source === "manual" ? "Required details fill karein" : "Save se pehle OCR values correct kar lein"}</Text>
            </View>
          </View>

          <Input label="ODOMETER READING (KM)" value={odometer} onChangeText={setOdometer} keyboardType="numeric" />
          {mode === "fuel" ? (
            <>
              <Input label="TOTAL AMOUNT (RS)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="e.g. 2000" />
              <View style={styles.twoColumns}>
                <Input compact label="PETROL (LITERS)" value={liters} onChangeText={setLiters} keyboardType="decimal-pad" placeholder="e.g. 7.81" />
                <Input compact label="RATE / LITER" value={unitPrice} onChangeText={setUnitPrice} keyboardType="decimal-pad" placeholder="e.g. 256.13" />
              </View>
              <Pressable style={styles.toggleRow} onPress={() => setFullTank((value) => !value)}>
                <View style={[styles.checkbox, fullTank && styles.checkboxActive]}>
                  {fullTank ? <Ionicons name="checkmark" size={15} color="#FFFFFF" /> : null}
                </View>
                <View style={styles.bannerCopy}>
                  <Text style={styles.toggleTitle}>Full tank refill</Text>
                  <Text style={styles.toggleSubtitle}>Accurate fuel average calculate karne mein help karta hai</Text>
                </View>
              </Pressable>
              <Text style={styles.calculationNote}>Any two values fill karein; third value automatically calculate ho jayegi.</Text>
            </>
          ) : null}
          <Pressable style={styles.saveButton} onPress={submit}>
            <Ionicons name="checkmark-circle-outline" size={21} color="#FFFFFF" />
            <Text style={styles.saveButtonText}>{mode === "fuel" ? "Save petrol log" : "Save odometer"}</Text>
          </Pressable>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function MethodButton({ icon, title, subtitle, onPress }: { icon: React.ComponentProps<typeof Ionicons>["name"]; title: string; subtitle: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.methodButton, pressed && styles.pressed]} onPress={onPress}>
      <View style={styles.methodIcon}><Ionicons name={icon} size={23} color={C.cyan} /></View>
      <View style={styles.bannerCopy}><Text style={styles.methodTitle}>{title}</Text><Text style={styles.methodSubtitle}>{subtitle}</Text></View>
      <Ionicons name="chevron-forward" size={18} color={C.muted} />
    </Pressable>
  );
}

type InputProps = React.ComponentProps<typeof TextInput> & { label: string; compact?: boolean };
function Input({ label, compact, ...props }: InputProps) {
  return (
    <View style={[styles.field, compact && styles.compactField]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput {...props} style={styles.input} placeholderTextColor="#526078" selectionColor={C.cyan} />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.bg },
  centered: { flex: 1, padding: 25, alignItems: "center", justifyContent: "center", backgroundColor: C.bg },
  topBar: { height: 62, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: C.border },
  topBarTitle: { color: C.text, fontSize: 16, fontWeight: "800" },
  roundButton: { width: 39, height: 39, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: "rgba(17,24,39,0.88)" },
  roundButtonPlaceholder: { width: 39, height: 39 },
  content: { padding: 22, paddingBottom: 35 },
  heroIcon: { width: 68, height: 68, marginTop: 13, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  chooseTitle: { marginTop: 20, color: C.text, fontSize: 22, fontWeight: "900", letterSpacing: -0.5 },
  chooseCopy: { marginTop: 7, marginBottom: 24, color: C.muted, fontSize: 12, lineHeight: 19 },
  methodButton: { minHeight: 76, marginBottom: 11, padding: 13, flexDirection: "row", alignItems: "center", borderRadius: 17, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  pressed: { opacity: 0.75, transform: [{ scale: 0.99 }] },
  methodIcon: { width: 45, height: 45, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#102A3E" },
  bannerCopy: { flex: 1, minWidth: 0, marginLeft: 12 },
  methodTitle: { color: C.text, fontSize: 14, fontWeight: "800" },
  methodSubtitle: { marginTop: 4, color: C.muted, fontSize: 10 },
  processing: { flex: 1, alignItems: "center", justifyContent: "center", padding: 25 },
  processingTitle: { marginTop: 17, color: C.text, fontSize: 17, fontWeight: "800" },
  processingCopy: { marginTop: 6, color: C.muted, fontSize: 11 },
  cameraContainer: { flex: 1, backgroundColor: "#000000" },
  cameraOverlay: { flex: 1, paddingHorizontal: 18, backgroundColor: "rgba(0,0,0,0.28)", justifyContent: "space-between" },
  cameraHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 8 },
  cameraTitle: { flex: 1, paddingHorizontal: 10, color: "#FFFFFF", fontSize: 13, fontWeight: "800", textAlign: "center" },
  scanFrame: { alignSelf: "center", width: "88%", height: 125, position: "relative", backgroundColor: "rgba(255,255,255,0.05)" },
  fuelScanFrame: { height: 260 },
  cornerTopLeft: { position: "absolute", top: 0, left: 0, width: 31, height: 31, borderTopWidth: 3, borderLeftWidth: 3, borderColor: C.cyan, borderTopLeftRadius: 12 },
  cornerTopRight: { position: "absolute", top: 0, right: 0, width: 31, height: 31, borderTopWidth: 3, borderRightWidth: 3, borderColor: C.cyan, borderTopRightRadius: 12 },
  cornerBottomLeft: { position: "absolute", bottom: 0, left: 0, width: 31, height: 31, borderBottomWidth: 3, borderLeftWidth: 3, borderColor: C.cyan, borderBottomLeftRadius: 12 },
  cornerBottomRight: { position: "absolute", bottom: 0, right: 0, width: 31, height: 31, borderBottomWidth: 3, borderRightWidth: 3, borderColor: C.cyan, borderBottomRightRadius: 12 },
  captureArea: { alignItems: "center", paddingBottom: 25 },
  cameraHint: { marginBottom: 16, color: "#FFFFFF", fontSize: 11, fontWeight: "700", textAlign: "center" },
  captureOuter: { width: 72, height: 72, borderRadius: 38, borderWidth: 4, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.25)" },
  captureInner: { width: 54, height: 54, borderRadius: 28, backgroundColor: "#FFFFFF" },
  permissionTitle: { marginTop: 16, color: C.text, fontSize: 20, fontWeight: "900" },
  permissionText: { maxWidth: 290, marginTop: 8, color: C.muted, fontSize: 12, lineHeight: 19, textAlign: "center" },
  permissionActions: { marginTop: 22, flexDirection: "row", gap: 10 },
  secondaryButton: { minHeight: 46, paddingHorizontal: 20, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: C.surface },
  secondaryButtonText: { color: "#C8D2E0", fontSize: 13, fontWeight: "800" },
  primarySmall: { minHeight: 46, paddingHorizontal: 20, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: C.blue },
  primaryButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  formContent: { padding: 21, paddingBottom: 40 },
  detectedBanner: { flexDirection: "row", alignItems: "center", marginBottom: 22, padding: 13, borderRadius: 15, backgroundColor: "#102A3E", borderWidth: 1, borderColor: "#214866" },
  bannerTitle: { color: C.text, fontSize: 12, fontWeight: "800" },
  bannerSubtitle: { marginTop: 3, color: C.muted, fontSize: 9 },
  field: { marginBottom: 16 },
  compactField: { flex: 1, minWidth: 0 },
  fieldLabel: { marginBottom: 7, color: C.muted, fontSize: 9, fontWeight: "900", letterSpacing: 0.7 },
  input: { height: 51, paddingHorizontal: 14, borderRadius: 14, color: C.text, fontSize: 15, fontWeight: "600", backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  twoColumns: { flexDirection: "row", gap: 11 },
  toggleRow: { flexDirection: "row", alignItems: "center", marginTop: 2, padding: 13, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  checkbox: { width: 23, height: 23, borderRadius: 7, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#526078" },
  checkboxActive: { borderColor: C.blue, backgroundColor: C.blue },
  toggleTitle: { color: C.text, fontSize: 12, fontWeight: "800" },
  toggleSubtitle: { marginTop: 3, color: C.muted, fontSize: 9 },
  calculationNote: { marginTop: 10, color: C.muted, fontSize: 9, lineHeight: 15 },
  saveButton: { minHeight: 52, marginTop: 22, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: C.blue },
  saveButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
});
