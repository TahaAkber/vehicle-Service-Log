import { Stack } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { VehicleStoreProvider } from "./data/vehicleStore";
import { AuthProvider, useAuth } from "../providers/AuthProvider";
import "./data/rideTracker";

function RootNavigator() {
  const { session, isLoading, isRecovery } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#52D6FF" />
        <Text style={styles.loadingText}>Opening your garage…</Text>
      </View>
    );
  }

  return (
    <VehicleStoreProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={Boolean(session) && !isRecovery}>
          <Stack.Screen name="(tabs)" />
        </Stack.Protected>
        <Stack.Protected guard={!session || isRecovery}>
          <Stack.Screen name="auth" />
        </Stack.Protected>
      </Stack>
    </VehicleStoreProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, backgroundColor: "#070C18" },
  loadingText: { color: "#8D9AAF", fontSize: 12, fontWeight: "600" },
});
