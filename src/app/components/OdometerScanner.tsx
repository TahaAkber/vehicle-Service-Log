import TextRecognition from "@react-native-ml-kit/text-recognition";
import { CameraView, useCameraPermissions } from "expo-camera";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface OdometerScannerProps {
  onScanSuccess: (kmReading: number) => void;
  onCancel: () => void;
}

export const OdometerScanner: React.FC<OdometerScannerProps> = ({
  onScanSuccess,
  onCancel,
}) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const cameraRef = useRef<CameraView>(null);

  // 1. Handle Permission State
  if (!permission) return <View style={styles.container} />;

  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <View style={styles.permissionIcon}>
          <Text style={styles.permissionIconText}>⌁</Text>
        </View>
        <Text style={styles.permissionTitle}>Camera access needed</Text>
        <Text style={styles.permissionText}>
          Speedometer photo ke liye camera access required hai.
        </Text>
        <View style={styles.permissionActions}>
          <TouchableOpacity style={styles.permissionCancel} onPress={onCancel}>
            <Text style={styles.permissionCancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.btnPrimary}
            onPress={permission.canAskAgain ? requestPermission : Linking.openSettings}
          >
            <Text style={styles.btnText}>
              {permission.canAskAgain ? "Allow camera" : "Open settings"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // 2. Capture & Process Image with ML Kit
  const captureAndRecognize = async (): Promise<void> => {
    if (!cameraRef.current || isProcessing) return;

    try {
      setIsProcessing(true);

      // Photo capture
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        skipProcessing: false,
      });

      if (!photo?.uri) {
        throw new Error("Failed to capture image");
      }

      // On-Device ML Kit OCR
      const result = await TextRecognition.recognize(photo.uri);

      // Regex to find numbers (e.g., 45210 or 12345.6)
      const foundNumbers = result.text.match(/\d+(\.\d+)?/g);

      if (foundNumbers && foundNumbers.length > 0) {
        // Filter numbers to find the most probable odometer reading
        const parsedNumbers = foundNumbers.map((n) => parseFloat(n));
        const detectedOdometer = Math.max(...parsedNumbers);

        onScanSuccess(detectedOdometer);
      } else {
        Alert.alert(
          "Scan Failed",
          "Speedometer se digits detect nahi hue. Dobara try karein.",
        );
      }
    } catch (error) {
      console.error("OCR Error:", error);
      Alert.alert("Error", "Image process karte hue masla aaya.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <View style={styles.container}>
      <CameraView style={styles.camera} ref={cameraRef}>
        {/* Transparent Frame Overlay */}
        <View style={styles.overlay}>
          <View style={styles.scanRegionFrame}>
            <Text style={styles.helperText}>
              Odometer reading ko box mein layein
            </Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionsContainer}>
            <TouchableOpacity
              style={styles.btnSecondary}
              onPress={onCancel}
              disabled={isProcessing}
            >
              <Text style={styles.btnSecondaryText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btnCapture, isProcessing && styles.btnDisabled]}
              onPress={captureAndRecognize}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.btnText}>Scan Reading</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </CameraView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#121212",
  },
  permissionText: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 24,
    color: "#94A3B8",
    lineHeight: 23,
  },
  permissionIcon: { width: 62, height: 62, marginBottom: 16, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "#102A3E" },
  permissionIconText: { color: "#52D6FF", fontSize: 32, fontWeight: "700" },
  permissionTitle: { marginBottom: 8, color: "#FFFFFF", fontSize: 20, fontWeight: "800" },
  permissionActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  permissionCancel: { minHeight: 46, paddingHorizontal: 20, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#1E293B" },
  permissionCancelText: { color: "#CBD5E1", fontSize: 14, fontWeight: "700" },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "space-between",
    paddingVertical: 50,
    paddingHorizontal: 20,
  },
  scanRegionFrame: {
    height: 120,
    marginTop: 100,
    borderWidth: 2,
    borderColor: "#00E676",
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  helperText: {
    color: "#00E676",
    fontSize: 14,
    fontWeight: "600",
  },
  actionsContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
  btnPrimary: {
    minHeight: 46,
    backgroundColor: "#2F80ED",
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  btnCapture: {
    backgroundColor: "#00E676",
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 30,
    minWidth: 150,
    alignItems: "center",
  },
  btnSecondary: {
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnText: {
    color: "#000",
    fontWeight: "700",
    fontSize: 16,
  },
  btnSecondaryText: {
    color: "#FFF",
    fontSize: 16,
  },
});
