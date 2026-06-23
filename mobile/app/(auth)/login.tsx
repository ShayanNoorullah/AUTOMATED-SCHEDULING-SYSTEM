import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import { AppLogo } from "../../src/components/AppLogo";
import { registerSession } from "../../src/api/client";
import { initSupabase, signIn } from "../../src/store/auth";
import { fetchMobileConfig, getServerUrl } from "../../src/store/server";
import { colors, styles } from "../../src/theme";
import { useTheme } from "../../src/context/ThemeContext";

async function ensureSupabase() {
  const server = await getServerUrl();
  if (!server) throw new Error("No server URL");
  const remote = await fetchMobileConfig(server);
  const url =
    remote?.supabaseUrl ||
    process.env.EXPO_PUBLIC_SUPABASE_URL ||
    (Constants.expoConfig?.extra?.supabaseUrl as string);
  const key =
    remote?.supabaseAnonKey ||
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    (Constants.expoConfig?.extra?.supabaseAnonKey as string);
  if (!url || !key) throw new Error("Supabase not configured on server or in .env");
  return initSupabase(url, key);
}

export default function LoginScreen() {
  useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    ensureSupabase()
      .then(() => setReady(true))
      .catch((e) => setError(e.message));
  }, []);

  async function onLogin() {
    setError("");
    setLoading(true);
    try {
      await ensureSupabase();
      const { session, error: err } = await signIn(email.trim(), password);
      if (err || !session) {
        setError(err || "Login failed");
        return;
      }
      await registerSession(session.access_token, session.refresh_token);
      router.replace("/(drawer)/groups");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  if (!ready && !error) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: 48 }]}>
        <View style={{ alignItems: "center", marginBottom: 24 }}>
          <AppLogo height={52} width={150} />
          <Text style={[styles.title, { marginTop: 12, fontSize: 22 }]}>SSIES Schedule</Text>
          <Text style={[styles.subtitle, { textAlign: "center", marginBottom: 0 }]}>
            Sign in with your account email and password.
          </Text>
        </View>
        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="you@example.com"
          placeholderTextColor={colors.muted}
        />
        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="Password"
          placeholderTextColor={colors.muted}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={styles.btn} onPress={onLogin} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Sign in</Text>}
        </Pressable>
        <Pressable onPress={() => router.push("/(auth)/server-setup")} style={{ marginTop: 16, alignItems: "center" }}>
          <Text style={{ color: colors.accent, fontWeight: "600" }}>Change server URL</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
