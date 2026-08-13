import { Stack } from "expo-router";

import { VehicleStoreProvider } from "./data/vehicleStore";

export default function RootLayout() {
  return (
    <VehicleStoreProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(screens)/dashboard" />
      </Stack>
    </VehicleStoreProvider>
  );
}
