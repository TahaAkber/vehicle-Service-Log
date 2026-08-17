import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { CommutePlace, RoutePoint } from "../data/rideTracker";
import RideMap from "./RideMap";

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
};

type SearchResult = CommutePlace & { id: string };

const addressLabel = (address: Location.LocationGeocodedAddress | undefined, fallback: string) =>
  address?.formattedAddress ??
  ([address?.name, address?.street, address?.district, address?.city]
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(", ") || fallback);

export default function LocationSearchSheet({
  visible,
  kind,
  initialPlace,
  home,
  work,
  onClose,
  onSelect,
}: {
  visible: boolean;
  kind: "home" | "work";
  initialPlace?: CommutePlace;
  home?: CommutePlace;
  work?: CommutePlace;
  onClose: () => void;
  onSelect: (place: CommutePlace) => void;
}) {
  const title = kind === "home" ? "Home" : "Work";
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<SearchResult | undefined>();
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setQuery(initialPlace?.label ?? "");
    setResults([]);
    setSelected(initialPlace ? { ...initialPlace, id: "initial" } : undefined);
  }, [initialPlace, visible]);

  const ensurePermission = async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) throw new Error("Location permission is needed to search and verify an address.");
  };

  const search = async () => {
    const term = query.trim();
    if (term.length < 3) {
      Alert.alert("Enter an address", "Type at least three characters, for example: Gulshan Block 7 Karachi.");
      return;
    }
    setIsSearching(true);
    try {
      await ensurePermission();
      const matches = (await Location.geocodeAsync(term)).slice(0, 5);
      const next: SearchResult[] = [];
      for (let index = 0; index < matches.length; index += 1) {
        const match = matches[index];
        const addresses = await Location.reverseGeocodeAsync(match).catch(() => []);
        next.push({
          id: `${match.latitude}-${match.longitude}-${index}`,
          latitude: match.latitude,
          longitude: match.longitude,
          label: addressLabel(addresses[0], `${term} · Result ${index + 1}`),
        });
      }
      setResults(next);
      setSelected(next[0]);
      if (!next.length) Alert.alert("No location found", "Try adding the area and city name to your search.");
    } catch (error) {
      Alert.alert("Search failed", error instanceof Error ? error.message : "Try a more complete address.");
    } finally {
      setIsSearching(false);
    }
  };

  const useCurrentLocation = async () => {
    setIsSearching(true);
    try {
      await ensurePermission();
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const addresses = await Location.reverseGeocodeAsync(location.coords).catch(() => []);
      const result: SearchResult = {
        id: "current",
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        label: addressLabel(addresses[0], `Current ${title} location`),
      };
      setQuery(result.label);
      setResults([result]);
      setSelected(result);
    } catch (error) {
      Alert.alert("Location unavailable", error instanceof Error ? error.message : "Try again outdoors.");
    } finally {
      setIsSearching(false);
    }
  };

  const previewRoute: RoutePoint[] = selected
    ? [{ latitude: selected.latitude, longitude: selected.longitude, timestamp: Date.now() }]
    : [];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable style={styles.closeButton} onPress={onClose}><Ionicons name="close" size={22} color={C.text} /></Pressable>
          <View style={styles.headerCopy}><Text style={styles.eyebrow}>COMMUTE LOCATION</Text><Text style={styles.title}>Set {title}</Text></View>
          <View style={styles.closeButtonPlaceholder} />
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.instructions}>Type an address or landmark, search it, then select the correct result.</Text>
          <View style={styles.searchRow}>
            <View style={styles.inputWrap}>
              <Ionicons name="search-outline" size={19} color={C.muted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={() => void search()}
                placeholder="e.g. Dolmen Mall Clifton, Karachi"
                placeholderTextColor="#526078"
                returnKeyType="search"
                style={styles.input}
              />
            </View>
            <Pressable style={styles.searchButton} onPress={() => void search()} disabled={isSearching}>
              {isSearching ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.searchButtonText}>Search</Text>}
            </Pressable>
          </View>
          <Pressable style={styles.currentButton} onPress={() => void useCurrentLocation()} disabled={isSearching}>
            <Ionicons name="locate-outline" size={17} color={C.cyan} />
            <Text style={styles.currentButtonText}>Use my current location instead</Text>
          </Pressable>

          <RideMap route={previewRoute} home={kind === "home" ? selected : home} work={kind === "work" ? selected : work} />

          {results.length ? <Text style={styles.resultHeading}>SEARCH RESULTS</Text> : null}
          {results.map((result) => {
            const isSelected = selected?.id === result.id;
            return (
              <Pressable key={result.id} style={[styles.resultRow, isSelected && styles.resultRowSelected]} onPress={() => setSelected(result)}>
                <View style={styles.pin}><Ionicons name="location-outline" size={19} color={isSelected ? C.cyan : C.muted} /></View>
                <View style={styles.resultCopy}><Text style={styles.resultTitle} numberOfLines={2}>{result.label}</Text><Text style={styles.coordinates}>{result.latitude.toFixed(5)}, {result.longitude.toFixed(5)}</Text></View>
                <Ionicons name={isSelected ? "checkmark-circle" : "ellipse-outline"} size={21} color={isSelected ? C.green : C.muted} />
              </Pressable>
            );
          })}

          <Pressable
            style={[styles.saveButton, !selected && styles.saveButtonDisabled]}
            disabled={!selected}
            onPress={() => selected && onSelect(selected)}
          >
            <Ionicons name="checkmark-circle-outline" size={21} color="#FFFFFF" />
            <Text style={styles.saveButtonText}>Select this {title.toLowerCase()} location</Text>
          </Pressable>
          <Text style={styles.attribution}>Address lookup uses the device geocoder. Map © OpenStreetMap contributors.</Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.bg },
  header: { minHeight: 62, flexDirection: "row", alignItems: "center", paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: C.border },
  closeButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: C.surface },
  closeButtonPlaceholder: { width: 40 },
  headerCopy: { flex: 1, alignItems: "center" },
  eyebrow: { color: C.cyan, fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  title: { marginTop: 3, color: C.text, fontSize: 17, fontWeight: "800" },
  content: { padding: 20, paddingBottom: 40 },
  instructions: { marginBottom: 13, color: C.muted, fontSize: 11, lineHeight: 18 },
  searchRow: { flexDirection: "row", gap: 8 },
  inputWrap: { flex: 1, height: 50, flexDirection: "row", alignItems: "center", paddingHorizontal: 13, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  input: { flex: 1, height: "100%", marginLeft: 8, color: C.text, fontSize: 12 },
  searchButton: { width: 76, height: 50, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: C.blue },
  searchButtonText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
  currentButton: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, marginVertical: 12, paddingVertical: 4 },
  currentButtonText: { color: C.cyan, fontSize: 10, fontWeight: "700" },
  resultHeading: { marginTop: 19, marginBottom: 9, color: C.muted, fontSize: 8, fontWeight: "900", letterSpacing: .9 },
  resultRow: { minHeight: 70, flexDirection: "row", alignItems: "center", marginBottom: 8, padding: 11, borderRadius: 15, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  resultRowSelected: { borderColor: "#286188", backgroundColor: "#102A3E" },
  pin: { width: 35, height: 35, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: C.raised },
  resultCopy: { flex: 1, minWidth: 0, marginHorizontal: 10 },
  resultTitle: { color: C.text, fontSize: 11, lineHeight: 16, fontWeight: "700" },
  coordinates: { marginTop: 4, color: C.muted, fontSize: 8 },
  saveButton: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 18, borderRadius: 15, backgroundColor: C.blue },
  saveButtonDisabled: { opacity: .45 },
  saveButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  attribution: { marginTop: 10, color: C.muted, fontSize: 8, textAlign: "center" },
});
