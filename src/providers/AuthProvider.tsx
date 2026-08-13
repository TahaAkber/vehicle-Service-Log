import type { Session, User } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { isSupabaseConfigured, supabase } from "../lib/supabase";

WebBrowser.maybeCompleteAuthSession();

type SocialProvider = "google" | "facebook";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  isRecovery: boolean;
  isConfigured: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<boolean>;
  signInWithSocial: (provider: SocialProvider) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearRecovery: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const redirectTo = Linking.createURL("auth/callback");

function authError(message?: string) {
  if (!message) return "Authentication complete nahi ho saki.";
  if (/invalid login credentials/i.test(message)) return "Email ya password incorrect hai.";
  if (/email not confirmed/i.test(message)) return "Pehle apni email confirm karein.";
  if (/already registered/i.test(message)) return "Is email ka account pehle se maujood hai.";
  if (/network|fetch/i.test(message)) return "Internet connection available nahi hai.";
  return message;
}

async function createSessionFromUrl(url: string) {
  const query = url.includes("#") ? url.slice(url.indexOf("#") + 1) : url.split("?")[1] ?? "";
  const params = new URLSearchParams(query);
  const errorDescription = params.get("error_description");
  if (errorDescription) throw new Error(errorDescription);

  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (!accessToken || !refreshToken) return false;

  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) throw error;
  return params.get("type") === "recovery";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRecovery, setIsRecovery] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) setSession(data.session);
      })
      .finally(() => active && setIsLoading(false));

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === "PASSWORD_RECOVERY") setIsRecovery(true);
      if (event === "SIGNED_OUT") setIsRecovery(false);
    });

    const handleUrl = ({ url }: { url: string }) => {
      createSessionFromUrl(url)
        .then((recovery) => recovery && setIsRecovery(true))
        .catch((error) => console.warn("Auth callback failed", error));
    };
    const linkingSubscription = Linking.addEventListener("url", handleUrl);
    Linking.getInitialURL()
      .then((url) => {
        if (url) {
          return createSessionFromUrl(url).then((recovery) => {
            if (recovery) setIsRecovery(true);
          });
        }
        return undefined;
      })
      .catch(() => undefined);

    return () => {
      active = false;
      data.subscription.unsubscribe();
      linkingSubscription.remove();
    };
  }, []);

  const ensureConfigured = useCallback(() => {
    if (!isSupabaseConfigured) {
      throw new Error("Supabase environment variables configure nahi hain.");
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    ensureConfigured();
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error(authError(error.message));
  }, [ensureConfigured]);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    ensureConfigured();
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: redirectTo,
        data: { display_name: name.trim() },
      },
    });
    if (error) throw new Error(authError(error.message));
    return !data.session;
  }, [ensureConfigured]);

  const signInWithSocial = useCallback(async (provider: SocialProvider) => {
    ensureConfigured();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) throw new Error(authError(error.message));
    if (!data.url) throw new Error("Provider login URL generate nahi hua.");

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type === "success") await createSessionFromUrl(result.url);
  }, [ensureConfigured]);

  const sendPasswordReset = useCallback(async (email: string) => {
    ensureConfigured();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    if (error) throw new Error(authError(error.message));
  }, [ensureConfigured]);

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw new Error(authError(error.message));
    setIsRecovery(false);
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) throw new Error(authError(error.message));
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user: session?.user ?? null,
    isLoading,
    isRecovery,
    isConfigured: isSupabaseConfigured,
    signIn,
    signUp,
    signInWithSocial,
    sendPasswordReset,
    updatePassword,
    signOut,
    clearRecovery: () => setIsRecovery(false),
  }), [isLoading, isRecovery, session, signIn, signInWithSocial, signOut, signUp, sendPasswordReset, updatePassword]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
