import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api/endpoints";
import { ListCard } from "../../src/components/ListCard";
import { useData } from "../../src/context/DataContext";
import { useReleaseStatus } from "../../src/hooks/useReleaseStatus";
import { messageFor, replaceTokens } from "../../src/lib/messageTokens";
import type { ReleaseTarget } from "../../src/types";
import { colors, styles } from "../../src/theme";

type Pick = { key: string; name: string; type: "group" | "contact"; phone?: string; checked: boolean };

export default function SendScreen() {
  const { groups, contacts, settings } = useData();
  const [session, setSession] = useState<Awaited<ReturnType<typeof api.waSession>> | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [releasing, setReleasing] = useState(false);
  const { lines, clear } = useReleaseStatus(releasing);

  const loadSession = useCallback(async () => {
    try {
      const s = await api.waSession();
      setSession(s);
      if (s.connected) setQr(null);
    } catch (e) {
      setSession({ provider: "unknown", connected: false, error: String(e) });
    }
  }, []);

  useEffect(() => {
    const items: Pick[] = [
      ...groups.map((g) => ({ key: `g-${g.name}`, name: g.name, type: "group" as const, checked: true })),
      ...contacts.map((c) => ({
        key: `c-${c.name}`,
        name: c.name,
        type: "contact" as const,
        phone: c.phone,
        checked: true,
      })),
    ];
    setPicks(items);
  }, [groups, contacts]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  async function pollQr() {
    try {
      const data = await api.waQr();
      if (data.connected) {
        setQr(null);
        await loadSession();
        return;
      }
      if (data.format === "image" && data.data) setQr(data.data);
      else if (data.data)
        setQr(`https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(data.data)}`);
    } catch {
      /* wait */
    }
  }

  async function startSession() {
    try {
      await api.waStart();
      await loadSession();
      await pollQr();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to start");
    }
  }

  async function resetSession() {
    try {
      await api.waReset();
      await loadSession();
      await pollQr();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Reset failed");
    }
  }

  async function sendSelected() {
    const selected = picks.filter((p) => p.checked);
    if (!selected.length) {
      Alert.alert("Select targets", "Choose at least one group or contact");
      return;
    }
    if (session?.provider === "selenium") {
      Alert.alert("WAHA required", "Configure WAHA in Superadmin on the web app. Selenium cannot run on mobile.");
      return;
    }
    if (!session?.connected) {
      Alert.alert("Not connected", "Link WhatsApp via WAHA first (Start / Show QR)");
      return;
    }

    const targets: ReleaseTarget[] = [];
    for (const p of selected) {
      if (p.type === "contact") {
        const c = contacts.find((x) => x.name === p.name);
        const msg = replaceTokens(c?.message || "");
        if (msg.trim()) targets.push({ name: p.name, phone: c?.phone, message: msg });
      } else {
        const g = groups.find((x) => x.name === p.name);
        const msg = replaceTokens(messageFor(g!));
        if (msg.trim()) targets.push({ name: p.name, message: msg });
      }
    }
    if (!targets.length) {
      Alert.alert("Empty messages", "Selected targets have no message content");
      return;
    }

    clear();
    setReleasing(true);
    try {
      await api.release(targets);
    } catch (e) {
      setReleasing(false);
      Alert.alert("Error", e instanceof Error ? e.message : "Release failed");
    }
  }

  useEffect(() => {
    if (!releasing) return;
    const done = lines.some((l) => l.type === "done");
    if (done) {
      setReleasing(false);
      loadSession();
    }
  }, [lines, releasing, loadSession]);

  useEffect(() => {
    if (!qr) return;
    const t = setInterval(pollQr, 3000);
    return () => clearInterval(t);
  }, [qr]);

  const provider = session?.provider || "…";
  const isWaha = provider === "waha";

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Ionicons
            name={session?.connected ? "checkmark-circle" : "ellipse-outline"}
            size={20}
            color={session?.connected ? colors.success : colors.muted}
          />
          <Text style={styles.title}>Session</Text>
        </View>
        <Text style={styles.listSub}>
          {session?.connected ? `Connected (${provider})` : session?.detail || session?.error || "Not connected"}
        </Text>
        {settings?.maintenanceMode ? (
          <Text style={styles.error}>Maintenance mode — automated send disabled</Text>
        ) : null}
        {!isWaha && session ? (
          <Text style={[styles.hint, { marginTop: 8 }]}>
            Mobile automated send requires WAHA. Set provider to WAHA in Superadmin → Settings.
          </Text>
        ) : null}
        <View style={styles.row}>
          <Pressable style={styles.btnSoft} onPress={startSession}>
            <Text style={styles.btnSoftText}>Start / QR</Text>
          </Pressable>
          <Pressable style={styles.btnSoft} onPress={resetSession}>
            <Text style={styles.btnSoftText}>Reset QR</Text>
          </Pressable>
          <Pressable style={styles.btnSoft} onPress={loadSession}>
            <Text style={styles.btnSoftText}>Refresh</Text>
          </Pressable>
        </View>
        {qr ? (
          <Image source={{ uri: qr }} style={{ width: 220, height: 220, alignSelf: "center", marginTop: 12 }} />
        ) : null}
      </View>

      <Text style={styles.sectionTitle}>Select targets</Text>
      {picks.map((p) => (
        <ListCard
          key={p.key}
          title={p.name}
          subtitle={p.type}
          icon={p.type === "group" ? "people-outline" : "person-outline"}
          onPress={() =>
            setPicks((prev) => prev.map((x) => (x.key === p.key ? { ...x, checked: !x.checked } : x)))
          }
          right={
            <Ionicons
              name={p.checked ? "checkbox" : "square-outline"}
              size={22}
              color={p.checked ? colors.accent : colors.muted}
            />
          }
        />
      ))}

      <Pressable style={[styles.btn, { marginTop: 12 }]} onPress={sendSelected} disabled={releasing}>
        {releasing ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Send selected</Text>}
      </Pressable>

      {lines.length > 0 ? (
        <View style={[styles.card, { marginTop: 16 }]}>
          <Text style={styles.sectionTitle}>Status log</Text>
          {lines.map((l, i) => (
            <Text
              key={`${i}-${l.raw}`}
              style={{
                fontSize: 12,
                marginBottom: 4,
                color: l.type === "error" ? colors.error : l.type === "success" ? colors.success : colors.muted,
              }}
            >
              {l.text}
            </Text>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}
