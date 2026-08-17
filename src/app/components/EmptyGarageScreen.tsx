import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useVehicleStore, type VehicleInput } from "../data/vehicleStore";
import { VehicleFormSheet } from "./DashboardSheets";

const C = {
  bg: "#070C18",
  surface: "#111827",
  border: "#243047",
  text: "#F8FAFC",
  muted: "#8D9AAF",
  cyan: "#52D6FF",
  blue: "#2F80ED",
};

export default function EmptyGarageScreen() {
  const { addVehicle } = useVehicleStore();
  const [showForm, setShowForm] = useState(false);

  const saveVehicle = (input: VehicleInput) => {
    addVehicle(input);
    setShowForm(false);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.content}>
        <LinearGradient colors={["#173B80", "#12617B"]} style={styles.iconWrap}>
          <Ionicons name="car-sport-outline" size={46} color="#FFFFFF" />
        </LinearGradient>
        <Text style={styles.eyebrow}>YOUR GARAGE</Text>
        <Text style={styles.title}>Add your first vehicle</Text>
        <Text style={styles.copy}>
          Start with a clean garage. Add each motorcycle or car separately to track its odometer,
          fuel, oil life, and service history.
        </Text>

        <View style={styles.features}>
          <Feature icon="speedometer-outline" text="Odometer and fuel tracking" />
          <Feature icon="water-outline" text="Custom oil-change intervals" />
          <Feature icon="cloud-done-outline" text="Offline access with cloud sync" />
        </View>

        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          onPress={() => setShowForm(true)}
        >
          <Ionicons name="add-circle-outline" size={21} color="#FFFFFF" />
          <Text style={styles.buttonText}>Add vehicle</Text>
        </Pressable>
      </View>

      <VehicleFormSheet
        key={`first-vehicle-${showForm}`}
        visible={showForm}
        onClose={() => setShowForm(false)}
        onSave={saveVehicle}
      />
    </SafeAreaView>
  );
}

function Feature({ icon, text }: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  text: string;
}) {
  return (
    <View style={styles.featureRow}>
      <View style={styles.featureIcon}>
        <Ionicons name={icon} size={18} color={C.cyan} />
      </View>
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.bg },
  content: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28, paddingBottom: 30 },
  iconWrap: { width: 92, height: 92, alignItems: "center", justifyContent: "center", borderRadius: 29, marginBottom: 24 },
  eyebrow: { color: C.cyan, fontSize: 9, fontWeight: "900", letterSpacing: 1.4 },
  title: { marginTop: 7, color: C.text, fontSize: 27, fontWeight: "900", letterSpacing: -0.8, textAlign: "center" },
  copy: { maxWidth: 420, marginTop: 11, color: C.muted, fontSize: 12, lineHeight: 19, textAlign: "center" },
  features: { width: "100%", maxWidth: 420, gap: 9, marginTop: 27, padding: 14, borderRadius: 18, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  featureRow: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: 11 },
  featureIcon: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: "#102A3E" },
  featureText: { color: "#C9D3E1", fontSize: 11, fontWeight: "600" },
  button: { width: "100%", maxWidth: 420, minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, marginTop: 18, borderRadius: 15, backgroundColor: C.blue },
  buttonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  pressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
});
