import { useEffect, useState } from "react";
import { Alert, FlatList, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { api } from "../../src/api/endpoints";
import { useData } from "../../src/context/DataContext";
import {
  ACCENT_SWATCHES,
  usePreferences,
  type CornerRadius,
  type DefaultPage,
  type DefaultSendMode,
  type FontSize,
  type NavIconStyle,
  type StatusLogPref,
  type TableZebra,
  type UiDensity,
} from "../../src/context/PreferencesContext";
import { useTheme, type ThemeMode } from "../../src/context/ThemeContext";
import { Button } from "../../src/components/ui";
import { colors, radii, spacing, styles } from "../../src/theme";

function SectionHeader({ icon, title }: { icon: keyof typeof Ionicons.glyphMap; title: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <Ionicons name={icon} size={18} color={colors.accent} />
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

function SegOption<T extends string>({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: radii.pill,
        backgroundColor: active ? colors.accent : colors.surface2,
        borderWidth: 1,
        borderColor: active ? colors.accent : colors.border,
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: "600", color: active ? "#fff" : colors.textSoft }}>{label}</Text>
    </Pressable>
  );
}

function ModeOption({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        alignItems: "center",
        paddingVertical: 12,
        gap: 6,
        borderRadius: radii.md,
        backgroundColor: active ? colors.accent : colors.surface,
        borderWidth: 1,
        borderColor: active ? colors.accent : colors.borderStrong,
      }}
    >
      <Ionicons name={icon} size={20} color={active ? "#fff" : colors.muted} />
      <Text style={{ fontSize: 12.5, fontWeight: "600", color: active ? "#fff" : colors.textSoft }}>{label}</Text>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const { settings, refresh } = useData();
  const { mode, setMode } = useTheme();
  const { prefs, setPref } = usePreferences();
  const [delay, setDelay] = useState("5");
  const [headless, setHeadless] = useState(false);
  const [cur, setCur] = useState("");
  const [nw, setNw] = useState("");
  const [audit, setAudit] = useState<{ action: string; detail: string; at: string }[]>([]);

  useEffect(() => {
    if (settings) {
      setDelay(String(settings.delaySeconds ?? 5));
      setHeadless(!!settings.headless);
    }
  }, [settings]);

  async function saveAutomation() {
    try {
      await api.updateSettings({
        delaySeconds: parseInt(delay, 10) || 5,
        headless,
      });
      await refresh();
      Alert.alert("Saved", "Automation settings updated");
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Save failed");
    }
  }

  async function changePw() {
    if (nw.length < 8) {
      Alert.alert("Error", "Password must be at least 8 characters");
      return;
    }
    try {
      await api.changePassword(cur, nw);
      setCur("");
      setNw("");
      Alert.alert("Done", "Password updated");
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed");
    }
  }

  async function loadAudit() {
    try {
      setAudit(await api.getAudit());
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to load audit");
    }
  }

  async function exportBackup() {
    try {
      const config = await api.getConfig();
      const path = `${FileSystem.cacheDirectory}ssies-backup.json`;
      await FileSystem.writeAsStringAsync(path, JSON.stringify(config, null, 2));
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, { mimeType: "application/json" });
      } else {
        Alert.alert("Exported", `Saved to ${path}`);
      }
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Export failed");
    }
  }

  async function importBackup() {
    try {
      const pick = await DocumentPicker.getDocumentAsync({ type: "application/json" });
      if (pick.canceled || !pick.assets?.[0]) return;
      const content = await FileSystem.readAsStringAsync(pick.assets[0].uri);
      const config = JSON.parse(content);
      Alert.alert("Restore", "Replace all groups, contacts, and templates?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Restore",
          style: "destructive",
          onPress: async () => {
            await api.restoreConfig(config);
            await refresh();
            Alert.alert("Done", "Data restored");
          },
        },
      ]);
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Import failed");
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <SectionHeader icon="color-palette-outline" title="Appearance" />
        <Text style={styles.label}>Theme</Text>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <ModeOption label="Light" icon="sunny-outline" active={mode === "light"} onPress={() => setMode("light")} />
          <ModeOption label="Dark" icon="moon-outline" active={mode === "dark"} onPress={() => setMode("dark")} />
          <ModeOption label="System" icon="phone-portrait-outline" active={mode === "system"} onPress={() => setMode("system")} />
        </View>

        <Text style={[styles.label, { marginTop: spacing.md }]}>Accent color</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          <SegOption label="Default" active={!prefs.accent} onPress={() => setPref("accent", null)} />
          {ACCENT_SWATCHES.map((hex) => (
            <Pressable
              key={hex}
              onPress={() => setPref("accent", hex)}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: hex,
                borderWidth: prefs.accent === hex ? 3 : 1,
                borderColor: prefs.accent === hex ? colors.text : colors.border,
              }}
            />
          ))}
        </View>

        <Text style={[styles.label, { marginTop: spacing.md }]}>Font size</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {(["small", "medium", "large"] as FontSize[]).map((v) => (
            <SegOption key={v} label={v} active={prefs.fontSize === v} onPress={() => setPref("fontSize", v)} />
          ))}
        </View>

        <Text style={[styles.label, { marginTop: spacing.md }]}>Corner radius</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {(["sharp", "rounded", "pill"] as CornerRadius[]).map((v) => (
            <SegOption key={v} label={v} active={prefs.cornerRadius === v} onPress={() => setPref("cornerRadius", v)} />
          ))}
        </View>

        <Text style={[styles.label, { marginTop: spacing.md }]}>Sidebar icons</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {(["outline", "filled"] as NavIconStyle[]).map((v) => (
            <SegOption key={v} label={v} active={prefs.navIconStyle === v} onPress={() => setPref("navIconStyle", v)} />
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <SectionHeader icon="grid-outline" title="Layout" />
        <Text style={styles.label}>UI density</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {(["compact", "comfortable", "spacious"] as UiDensity[]).map((v) => (
            <SegOption key={v} label={v} active={prefs.uiDensity === v} onPress={() => setPref("uiDensity", v)} />
          ))}
        </View>

        <Text style={[styles.label, { marginTop: spacing.md }]}>Default landing page</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {(["groups", "schedule", "contacts", "send"] as DefaultPage[]).map((v) => (
            <SegOption key={v} label={v} active={prefs.defaultPage === v} onPress={() => setPref("defaultPage", v)} />
          ))}
        </View>

        <Text style={[styles.label, { marginTop: spacing.md }]}>Schedule table zebra stripes</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {(["off", "on"] as TableZebra[]).map((v) => (
            <SegOption key={v} label={v} active={prefs.tableZebra === v} onPress={() => setPref("tableZebra", v)} />
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <SectionHeader icon="logo-whatsapp" title="WhatsApp UX" />
        <Text style={styles.label}>Default send method</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {(["ask", "direct", "automated"] as DefaultSendMode[]).map((v) => (
            <SegOption key={v} label={v} active={prefs.defaultSendMode === v} onPress={() => setPref("defaultSendMode", v)} />
          ))}
        </View>
        <Text style={styles.hint}>Automated uses WAHA on this screen; direct opens WhatsApp links.</Text>

        <Text style={[styles.label, { marginTop: spacing.md }]}>Status log</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {(["auto", "always", "never"] as StatusLogPref[]).map((v) => (
            <SegOption key={v} label={v} active={prefs.statusLog === v} onPress={() => setPref("statusLog", v)} />
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <SectionHeader icon="timer-outline" title="Automation" />
        <Text style={styles.label}>Delay between sends (seconds)</Text>
        <TextInput style={styles.input} value={delay} onChangeText={setDelay} keyboardType="number-pad" placeholderTextColor={colors.faint} />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md }}>
          <View style={{ flex: 1, paddingRight: spacing.md }}>
            <Text style={styles.label}>Headless mode</Text>
            <Text style={styles.hint}>Run browser automation without visible window (web/Selenium).</Text>
          </View>
          <Switch value={headless} onValueChange={setHeadless} trackColor={{ true: colors.accent }} />
        </View>
        <Button label="Save automation" icon="save-outline" onPress={saveAutomation} full />
      </View>

      <View style={styles.card}>
        <SectionHeader icon="shield-checkmark-outline" title="Security" />
        <Text style={styles.label}>Current password</Text>
        <TextInput style={styles.input} secureTextEntry value={cur} onChangeText={setCur} placeholderTextColor={colors.faint} />
        <Text style={styles.label}>New password</Text>
        <TextInput style={styles.input} secureTextEntry value={nw} onChangeText={setNw} placeholderTextColor={colors.faint} />
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <Button label="Update password" variant="soft" icon="key-outline" onPress={changePw} />
          <Button label="Activity log" variant="soft" icon="list-outline" onPress={loadAudit} />
        </View>
      </View>

      {audit.length > 0 ? (
        <FlatList
          scrollEnabled={false}
          data={audit.slice(0, 50)}
          keyExtractor={(a, i) => `${a.at}-${i}`}
          renderItem={({ item }) => (
            <View style={styles.listItem}>
              <Text style={styles.listTitle}>{item.action}</Text>
              <Text style={styles.listSub}>{item.detail}</Text>
              <Text style={styles.hint}>{item.at}</Text>
            </View>
          )}
        />
      ) : null}

      <View style={styles.card}>
        <SectionHeader icon="cloud-download-outline" title="Data" />
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <Button label="Download backup" variant="soft" icon="download-outline" onPress={exportBackup} />
          <Button label="Restore" variant="soft" icon="cloud-upload-outline" onPress={importBackup} />
        </View>
      </View>
    </ScrollView>
  );
}
