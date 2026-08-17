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

const cleanNumber = (value: string) => parseLocalizedNumber(value);

function parseLocalizedNumber(value: string) {
  const cleaned = value.replace(/[^\d.,]/g, "");
  if (!cleaned) return Number.NaN;
  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");
  const separatorIndex = Math.max(lastDot, lastComma);
  if (separatorIndex < 0) return Number(cleaned);

  const fractionLength = cleaned.length - separatorIndex - 1;
  const separator = cleaned[separatorIndex];
  const separatorCount = cleaned.split(separator).length - 1;
  if (separator === "," && fractionLength === 3 && separatorCount === 1) {
    return Number(cleaned.replace(/[.,]/g, ""));
  }

  const integer = cleaned.slice(0, separatorIndex).replace(/[.,]/g, "");
  const fraction = cleaned.slice(separatorIndex + 1).replace(/[.,]/g, "");
  return Number(fractionLength > 0 ? `${integer}.${fraction}` : integer);
}

const extractNumbers = (text: string) =>
  (text.match(/\d[\d,.]*/g) ?? [])
    .map(cleanNumber)
    .filter((value) => Number.isFinite(value) && value >= 0);

function parseOdometer(result: TextRecognitionResult, current: number) {
  const lines = result.blocks
    .flatMap((block) => block.lines)
    .map((line) => ({ text: line.text, top: line.frame?.top ?? 99999 }))
    .sort((a, b) => a.top - b.top);

  const candidates = lines.flatMap((line, lineIndex) => {
    const isOdometerLine = /\b(?:odo(?:meter)?|total)\b|\bkm\b/i.test(line.text);
    const isDistractor = /\b(?:trip|range|avg|average|clock|time|temp|cons|fuel|date)\b/i.test(line.text);
    const looksLikeDateOrTime = /\d{1,4}\s*[:/-]\s*\d{1,2}/.test(line.text);
    return (line.text.match(/\d(?:[\d\s]*\d)?(?:[.,]\d+)?/g) ?? []).flatMap((token) => {
      const compact = token.replace(/\s/g, "");
      const digits = compact.replace(/\D/g, "");
      const rawValue = parseLocalizedNumber(compact);
      const values = digits.length === 6 && !/[.,]/.test(compact)
        ? [rawValue, rawValue / 10]
        : [rawValue];

      return values.map((value) => {
        let score = digits.length >= 4 && digits.length <= 7 ? 6 : -7;
        if (isOdometerLine) score += 9;
        if (isDistractor) score -= 12;
        if (looksLikeDateOrTime) score -= 12;
        if (value >= current && value - current <= 5000) score += 8;
        if (current > 0 && value >= current) score += Math.max(0, 4 - (value - current) / 500);
        if (current > 0 && value < current) score -= 14;
        if (current > 0 && value - current > 5000) score -= 8;
        if (current > 0 && value > current * 3) score -= 8;
        if (lineIndex < 4) score += 1;
        if (value > 9_999_999 || value < 1) score -= 20;
        return { value: Number(value.toFixed(1)), score };
      });
    });
  });

  const best = candidates.sort((a, b) => b.score - a.score)[0];
  if (!best || best.score < (current > 0 ? 7 : 9)) return undefined;
  return best.value;
}

function parseFuel(result: TextRecognitionResult) {
  const lines = result.blocks.flatMap((block) => block.lines.map((line) => line.text));
  const amountLabel = /\b(?:amount|sale|total|payable|pkr)\b/i;
  const litersLabel = /\b(?:lit(?:er|re)s?|volume|qty|quantity)\b/i;
  const rateLabel = /\b(?:rate|unit\s*price)\b|price\s*(?:\/|per)\s*l/i;

  const validFor = (kind: "amount" | "liters" | "rate", value: number) => {
    if (kind === "amount") return value >= 50 && value <= 100_000;
    if (kind === "liters") return value >= 0.1 && value <= 500;
    return value >= 20 && value <= 5_000;
  };

  const nearLabel = (label: RegExp, kind: "amount" | "liters" | "rate") => {
    for (let index = 0; index < lines.length; index += 1) {
      if (!label.test(lines[index])) continue;
      for (const nearbyIndex of [index, index - 1, index + 1, index - 2, index + 2]) {
        if (nearbyIndex < 0 || nearbyIndex >= lines.length) continue;
        const values = extractNumbers(lines[nearbyIndex]).filter((value) => validFor(kind, value));
        if (values.length) return values[values.length - 1];
      }
    }
    return undefined;
  };

  let amount = nearLabel(amountLabel, "amount");
  let liters = nearLabel(litersLabel, "liters");
  let unitPrice = nearLabel(rateLabel, "rate");
  const all = [...new Set(extractNumbers(result.text).filter((value) => value > 0))];

  // Unlabelled displays are accepted only when all three values agree mathematically.
  if (!amount || !liters || !unitPrice) {
    let best: { amount: number; liters: number; unitPrice: number; error: number } | undefined;
    for (const amountCandidate of all.filter((value) => validFor("amount", value))) {
      for (const litersCandidate of all.filter((value) => validFor("liters", value))) {
        for (const rateCandidate of all.filter((value) => validFor("rate", value))) {
          if (new Set([amountCandidate, litersCandidate, rateCandidate]).size < 3) continue;
          const error = Math.abs(amountCandidate - litersCandidate * rateCandidate) / amountCandidate;
          if (error <= 0.08 && (!best || error < best.error)) {
            best = { amount: amountCandidate, liters: litersCandidate, unitPrice: rateCandidate, error };
          }
        }
      }
    }
    if (best) {
      amount ??= best.amount;
      liters ??= best.liters;
      unitPrice ??= best.unitPrice;
    }
  }

  const known = [amount, liters, unitPrice].filter((value) => value !== undefined).length;
  if (known >= 2) {
    if (!liters && amount && unitPrice) liters = amount / unitPrice;
    if (!amount && liters && unitPrice) amount = liters * unitPrice;
    if (!unitPrice && amount && liters) unitPrice = amount / liters;
  }

  if (amount && liters && unitPrice) {
    const error = Math.abs(amount - liters * unitPrice) / amount;
    if (error > 0.1) return {};
  }
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
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [odometer, setOdometer] = useState(String(currentOdometer));
  const [amount, setAmount] = useState("");
  const [liters, setLiters] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [fullTank, setFullTank] = useState(false);

  const title = mode === "odometer" ? "Add odometer reading" : "Add fuel refill";

  const processImage = async (uri: string, nextSource: ScanSource) => {
    try {
      setIsProcessing(true);
      const result = await TextRecognition.recognize(uri);
      setSource(nextSource);

      if (mode === "odometer") {
        const detected = parseOdometer(result, currentOdometer);
        if (detected !== undefined) setOdometer(String(detected));
        else Alert.alert("Reading unclear", "OCR could not detect the reading. Enter the value manually.");
      } else {
        const detected = parseFuel(result);
        setAmount("");
        setLiters("");
        setUnitPrice("");
        if (detected.amount) setAmount(detected.amount.toFixed(2));
        if (detected.liters) setLiters(detected.liters.toFixed(3));
        if (detected.unitPrice) setUnitPrice(detected.unitPrice.toFixed(2));
        if (!detected.amount && !detected.liters && !detected.unitPrice) {
          Alert.alert("Pump values unclear", "The image was processed, but the values were unclear. Correct them manually below.");
        }
      }
      setStep("confirm");
    } catch (error) {
      console.error("OCR error", error);
      Alert.alert("Could not read image", "Try again with a clearer image or use manual entry.");
    } finally {
      setIsProcessing(false);
    }
  };

  const chooseGallery = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert(
        "Gallery access needed",
        "Allow photo library access to select an image from your device.",
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
    setIsCameraReady(false);
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
    if (!cameraRef.current || !isCameraReady || isProcessing) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 1, skipProcessing: false });
      if (photo?.uri) await processImage(photo.uri, "camera");
    } catch (error) {
      console.error("Camera capture error", error);
      Alert.alert("Could not take photo", "Wait for the camera to focus, then try again.");
    }
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
      Alert.alert("Invalid odometer", "Enter a valid odometer reading.");
      return;
    }

    if (mode === "odometer") {
      if (parsedOdometer < currentOdometer) {
        Alert.alert(
          "Reading cannot decrease",
          `The current saved odometer is ${currentOdometer.toLocaleString()} km. Correct the reading and save it again.`,
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
      Alert.alert("More details needed", "Enter at least two of these values: amount, liters, or price per liter.");
      return;
    }
    if (!hasLiters) parsedLiters = parsedAmount / parsedRate;
    if (!hasAmount) parsedAmount = parsedLiters * parsedRate;
    if (!hasRate) parsedRate = parsedAmount / parsedLiters;

    if (parsedOdometer < currentOdometer) {
      Alert.alert(
        "Reading cannot decrease",
        `The current saved odometer is ${currentOdometer.toLocaleString()} km.`,
      );
      return;
    }
    const fuelMathError = Math.abs(parsedAmount - parsedLiters * parsedRate) / parsedAmount;
    if (fuelMathError > 0.1) {
      Alert.alert(
        "Fuel values do not match",
        "Amount should be close to liters × price per liter. Correct the scanned values before saving.",
      );
      return;
    }

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
          <Text style={styles.permissionText}>Camera permission is required to scan a photo.</Text>
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
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          mode="picture"
          onCameraReady={() => setIsCameraReady(true)}
          onMountError={({ message }) => Alert.alert("Camera unavailable", message)}
        />
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
            <Text style={styles.cameraHint}>{mode === "odometer" ? "Keep the total odometer clear and straight" : "Make sure the amount, liters, and price are visible"}</Text>
            <Pressable
              style={[styles.captureOuter, !isCameraReady && styles.captureDisabled]}
              onPress={capture}
              disabled={isProcessing || !isCameraReady}
            >
              {isProcessing || !isCameraReady ? <ActivityIndicator color="#FFFFFF" /> : <View style={styles.captureInner} />}
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
          <Text style={styles.processingCopy}>On-device OCR is detecting the values.</Text>
        </View>
      ) : step === "choose" ? (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.heroIcon, { backgroundColor: mode === "fuel" ? "#123D31" : "#102A3E" }]}>
            <Ionicons name={mode === "fuel" ? "flame-outline" : "speedometer-outline"} size={34} color={mode === "fuel" ? C.green : C.cyan} />
          </View>
          <Text style={styles.chooseTitle}>{mode === "fuel" ? "How do you want to add fuel?" : "How do you want to add the reading?"}</Text>
          <Text style={styles.chooseCopy}>You can review and edit the values after scanning a photo.</Text>
          <MethodButton icon="camera-outline" title="Take a photo" subtitle={mode === "fuel" ? "Scan the fuel pump display" : "Scan the motorcycle odometer"} onPress={openCamera} />
          <MethodButton icon="images-outline" title="Choose from gallery" subtitle="Use an existing image from your phone" onPress={chooseGallery} />
          <MethodButton icon="keypad-outline" title="Enter manually" subtitle="Use when no image is available" onPress={useManual} />
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
          <View style={styles.detectedBanner}>
            <Ionicons name={source === "manual" ? "create-outline" : "scan-circle-outline"} size={21} color={C.cyan} />
            <View style={styles.bannerCopy}>
              <Text style={styles.bannerTitle}>{source === "manual" ? "Manual entry" : "Review detected values"}</Text>
              <Text style={styles.bannerSubtitle}>{source === "manual" ? "Enter the required details" : "Review the OCR values before saving"}</Text>
            </View>
          </View>

          <Input label="ODOMETER READING (KM)" value={odometer} onChangeText={setOdometer} keyboardType="numeric" />
          {mode === "fuel" ? (
            <>
              <Input label="TOTAL AMOUNT (RS)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="e.g. 2000" />
              <View style={styles.twoColumns}>
                <Input compact label="FUEL (LITERS)" value={liters} onChangeText={setLiters} keyboardType="decimal-pad" placeholder="e.g. 7.81" />
                <Input compact label="RATE / LITER" value={unitPrice} onChangeText={setUnitPrice} keyboardType="decimal-pad" placeholder="e.g. 256.13" />
              </View>
              <Pressable style={styles.toggleRow} onPress={() => setFullTank((value) => !value)}>
                <View style={[styles.checkbox, fullTank && styles.checkboxActive]}>
                  {fullTank ? <Ionicons name="checkmark" size={15} color="#FFFFFF" /> : null}
                </View>
                <View style={styles.bannerCopy}>
                  <Text style={styles.toggleTitle}>Full tank refill</Text>
                  <Text style={styles.toggleSubtitle}>Helps calculate accurate fuel efficiency</Text>
                </View>
              </Pressable>
              <Text style={styles.calculationNote}>Enter any two values and the third will be calculated automatically.</Text>
            </>
          ) : null}
          <Pressable style={styles.saveButton} onPress={submit}>
            <Ionicons name="checkmark-circle-outline" size={21} color="#FFFFFF" />
            <Text style={styles.saveButtonText}>{mode === "fuel" ? "Save fuel log" : "Save odometer"}</Text>
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
  captureDisabled: { opacity: 0.55 },
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
