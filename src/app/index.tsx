import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.content}>
        <Text style={styles.eyebrow}>VEHICLE SERVICE LOG</Text>
        <Text style={styles.title}>Home</Text>
        <Text style={styles.description}>
          Keep your vehicle maintenance records organized in one place.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F7F8FA",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  eyebrow: {
    marginBottom: 8,
    color: "#2563EB",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1.4,
  },
  title: {
    color: "#111827",
    fontSize: 40,
    fontWeight: "700",
  },
  description: {
    maxWidth: 420,
    marginTop: 12,
    color: "#4B5563",
    fontSize: 17,
    lineHeight: 25,
  },
});
