import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "../providers/AuthProvider";

type Mode = "login" | "signup" | "forgot";

const C = {
  bg: "#070C18",
  surface: "#111827",
  raised: "#172033",
  border: "#263249",
  text: "#F8FAFC",
  muted: "#8D9AAF",
  cyan: "#52D6FF",
  blue: "#2F80ED",
  green: "#36D399",
  red: "#FF647C",
};

export default function AuthScreen() {
  const {
    isConfigured,
    isRecovery,
    signIn,
    signUp,
    signInWithSocial,
    sendPasswordReset,
    updatePassword,
    clearRecovery,
  } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState<string>();

  const recoveryMode = isRecovery;
  const title = recoveryMode
    ? "Create new password"
    : mode === "signup"
      ? "Create your account"
      : mode === "forgot"
        ? "Reset your password"
        : "Welcome back";
  const subtitle = recoveryMode
    ? "Apne account ke liye secure password set karein."
    : mode === "signup"
      ? "Your garage, service history and fuel records—available on every device."
      : mode === "forgot"
        ? "Password reset link aapki email par bhej denge."
        : "Sign in to keep your vehicle data safely synced.";

  const run = async (key: string, action: () => Promise<void>) => {
    try {
      setBusy(key);
      await action();
    } catch (error) {
      Alert.alert("Could not continue", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusy(undefined);
    }
  };

  const submit = () => run("form", async () => {
    if (recoveryMode) {
      if (password.length < 8) throw new Error("Password kam az kam 8 characters ka hona chahiye.");
      if (password !== confirmPassword) throw new Error("Passwords match nahi kar rahe.");
      await updatePassword(password);
      Alert.alert("Password updated", "Aapka password successfully change ho gaya.");
      return;
    }

    if (!email.trim() || !email.includes("@")) throw new Error("Valid email address enter karein.");
    if (mode === "forgot") {
      await sendPasswordReset(email);
      Alert.alert("Check your email", "Password reset link send kar diya gaya hai.");
      setMode("login");
      return;
    }
    if (password.length < 8) throw new Error("Password kam az kam 8 characters ka hona chahiye.");

    if (mode === "signup") {
      if (!name.trim()) throw new Error("Apna name enter karein.");
      if (password !== confirmPassword) throw new Error("Passwords match nahi kar rahe.");
      const confirmationNeeded = await signUp(name, email, password);
      if (confirmationNeeded) {
        Alert.alert("Confirm your email", "Account ban gaya. Email mein confirmation link open karein.");
        setMode("login");
      }
      return;
    }
    await signIn(email, password);
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brandRow}>
            <LinearGradient colors={["#2F80ED", "#27B7DA"]} style={styles.logo}>
              <Ionicons name="speedometer" size={25} color="#FFFFFF" />
            </LinearGradient>
            <View>
              <Text style={styles.brand}>MotoLog</Text>
              <Text style={styles.brandCaption}>VEHICLE CARE, SIMPLIFIED</Text>
            </View>
          </View>

          <View style={styles.heroCopy}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>

          {!isConfigured ? (
            <View style={styles.configWarning}>
              <Ionicons name="warning-outline" size={19} color="#FFCB72" />
              <View style={styles.flex}>
                <Text style={styles.warningTitle}>Supabase setup required</Text>
                <Text style={styles.warningText}>.env mein project URL aur publishable key add karein.</Text>
              </View>
            </View>
          ) : null}

          <View style={styles.card}>
            {!recoveryMode && mode === "signup" ? (
              <AuthField
                label="FULL NAME"
                icon="person-outline"
                value={name}
                onChangeText={setName}
                placeholder="Your name"
                autoCapitalize="words"
              />
            ) : null}

            {!recoveryMode ? (
              <AuthField
                label="EMAIL ADDRESS"
                icon="mail-outline"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            ) : null}

            {mode !== "forgot" || recoveryMode ? (
              <AuthField
                label={recoveryMode ? "NEW PASSWORD" : "PASSWORD"}
                icon="lock-closed-outline"
                value={password}
                onChangeText={setPassword}
                placeholder="Minimum 8 characters"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                trailing={
                  <Pressable hitSlop={10} onPress={() => setShowPassword((value) => !value)}>
                    <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={19} color={C.muted} />
                  </Pressable>
                }
              />
            ) : null}

            {recoveryMode || mode === "signup" ? (
              <AuthField
                label="CONFIRM PASSWORD"
                icon="shield-checkmark-outline"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Enter password again"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
            ) : null}

            {!recoveryMode && mode === "login" ? (
              <Pressable style={styles.forgotButton} onPress={() => setMode("forgot")}>
                <Text style={styles.forgotText}>Forgot password?</Text>
              </Pressable>
            ) : null}

            <Pressable
              disabled={Boolean(busy) || !isConfigured}
              onPress={submit}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, Boolean(busy) && styles.disabled]}
            >
              {busy === "form" ? <ActivityIndicator color="#FFFFFF" /> : (
                <>
                  <Text style={styles.primaryText}>
                    {recoveryMode ? "Update password" : mode === "signup" ? "Create account" : mode === "forgot" ? "Send reset link" : "Sign in"}
                  </Text>
                  <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                </>
              )}
            </Pressable>

            {!recoveryMode && mode !== "forgot" ? (
              <>
                <View style={styles.dividerRow}>
                  <View style={styles.divider} />
                  <Text style={styles.dividerText}>OR CONTINUE WITH</Text>
                  <View style={styles.divider} />
                </View>
                <View style={styles.socialRow}>
                  <SocialButton
                    label="Google"
                    icon="logo-google"
                    loading={busy === "google"}
                    disabled={Boolean(busy) || !isConfigured}
                    onPress={() => run("google", () => signInWithSocial("google"))}
                  />
                  <SocialButton
                    label="Facebook"
                    icon="logo-facebook"
                    color="#5B8DEF"
                    loading={busy === "facebook"}
                    disabled={Boolean(busy) || !isConfigured}
                    onPress={() => run("facebook", () => signInWithSocial("facebook"))}
                  />
                </View>
              </>
            ) : null}

            <Pressable
              style={styles.switchButton}
              onPress={() => {
                if (recoveryMode) clearRecovery();
                setMode(mode === "login" ? "signup" : "login");
              }}
            >
              <Text style={styles.switchMuted}>
                {recoveryMode || mode === "forgot" ? "Back to sign in" : mode === "signup" ? "Already have an account? " : "New to MotoLog? "}
              </Text>
              {!recoveryMode && mode !== "forgot" ? (
                <Text style={styles.switchLink}>{mode === "signup" ? "Sign in" : "Create account"}</Text>
              ) : null}
            </Pressable>
          </View>

          <View style={styles.offlineNote}>
            <Ionicons name="cloud-offline-outline" size={16} color={C.green} />
            <Text style={styles.offlineText}>Once signed in, logs work offline and sync automatically when internet returns.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type FieldProps = React.ComponentProps<typeof TextInput> & {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  trailing?: React.ReactNode;
};

function AuthField({ label, icon, trailing, ...props }: FieldProps) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputWrap}>
        <Ionicons name={icon} size={18} color={C.muted} />
        <TextInput {...props} style={styles.input} placeholderTextColor="#536078" selectionColor={C.cyan} />
        {trailing}
      </View>
    </View>
  );
}

function SocialButton({ label, icon, color = C.text, loading, disabled, onPress }: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  color?: string;
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.socialButton, pressed && styles.pressed, disabled && styles.disabled]}>
      {loading ? <ActivityIndicator size="small" color={color} /> : <Ionicons name={icon} size={19} color={color} />}
      <Text style={styles.socialText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 20, paddingBottom: 30 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  logo: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 15 },
  brand: { color: C.text, fontSize: 20, fontWeight: "900", letterSpacing: -0.4 },
  brandCaption: { marginTop: 2, color: C.cyan, fontSize: 8, fontWeight: "900", letterSpacing: 1.2 },
  heroCopy: { marginTop: 42, marginBottom: 24 },
  title: { color: C.text, fontSize: 30, fontWeight: "900", letterSpacing: -1 },
  subtitle: { maxWidth: 420, marginTop: 9, color: C.muted, fontSize: 13, lineHeight: 20 },
  configWarning: { flexDirection: "row", gap: 10, marginBottom: 14, padding: 13, borderRadius: 13, backgroundColor: "#2A2114", borderWidth: 1, borderColor: "#60491F" },
  warningTitle: { color: "#FFE1A6", fontSize: 12, fontWeight: "800" },
  warningText: { marginTop: 2, color: "#BDA67C", fontSize: 10, lineHeight: 15 },
  card: { padding: 18, borderRadius: 22, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  fieldWrap: { marginBottom: 15 },
  fieldLabel: { marginBottom: 7, color: "#A9B5C7", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  inputWrap: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, borderRadius: 13, backgroundColor: C.raised, borderWidth: 1, borderColor: "#2D3A52" },
  input: { flex: 1, color: C.text, fontSize: 14 },
  forgotButton: { alignSelf: "flex-end", marginTop: -5, marginBottom: 17, paddingVertical: 4 },
  forgotText: { color: C.cyan, fontSize: 11, fontWeight: "700" },
  primaryButton: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, marginTop: 2, borderRadius: 14, backgroundColor: C.blue },
  primaryText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 22 },
  divider: { flex: 1, height: 1, backgroundColor: C.border },
  dividerText: { color: "#657187", fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  socialRow: { flexDirection: "row", gap: 10 },
  socialButton: { flex: 1, minHeight: 49, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 13, backgroundColor: C.raised, borderWidth: 1, borderColor: C.border },
  socialText: { color: C.text, fontSize: 12, fontWeight: "700" },
  switchButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 22, paddingVertical: 4 },
  switchMuted: { color: C.muted, fontSize: 11 },
  switchLink: { color: C.cyan, fontSize: 11, fontWeight: "800" },
  offlineNote: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 20, paddingHorizontal: 10 },
  offlineText: { flexShrink: 1, color: C.muted, fontSize: 9, lineHeight: 14, textAlign: "center" },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.55 },
});
