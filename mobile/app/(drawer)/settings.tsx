import { useEffect, useState } from "react";
import { Alert, FlatList, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { api } from "../../src/api/endpoints";
import { useData } from "../../src/context/DataContext";
import { colors, styles } from "../../src/theme";

function SectionHeader({ icon, title }: { icon: keyof typeof Ionicons.glyphMap; title: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <Ionicons name={icon} size={18} color={colors.accent} />
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

export default function SettingsScreen() {
  const { settings, refresh } = useData();
  const [delay, setDelay] = useState("5");
  const [cur, setCur] = useState("");
  const [nw, setNw] = useState("");
  const [audit, setAudit] = useState<{ action: string; detail: string; at: string }[]>([]);

  useEffect(() => {
    if (settings) setDelay(String(settings.delaySeconds ?? 5));
  }, [settings]);

  async function saveDelay() {
    try {
      await api.updateSettings({ delaySeconds: parseInt(delay, 10) || 5 });
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
      const rows = await api.getAudit();
      setAudit(rows);
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
        <SectionHeader icon="timer-outline" title="Automation" />
        <Text style={styles.label}>Delay between sends (seconds)</Text>
        <TextInput style={styles.input} value={delay} onChangeText={setDelay} keyboardType="number-pad" />
        <Pressable style={styles.btn} onPress={saveDelay}>
          <Text style={styles.btnText}>Save</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <SectionHeader icon="shield-checkmark-outline" title="Security" />
        <Text style={styles.label}>Current password</Text>
        <TextInput style={styles.input} secureTextEntry value={cur} onChangeText={setCur} />
        <Text style={styles.label}>New password</Text>
        <TextInput style={styles.input} secureTextEntry value={nw} onChangeText={setNw} />
        <Pressable style={styles.btnSoft} onPress={changePw}>
          <Text style={styles.btnSoftText}>Update password</Text>
        </Pressable>
        <Pressable style={[styles.btnSoft, { marginTop: 12 }]} onPress={loadAudit}>
          <Text style={styles.btnSoftText}>Load activity log</Text>
        </Pressable>
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
        <Pressable style={styles.btnSoft} onPress={exportBackup}>
          <Text style={styles.btnSoftText}>Download backup</Text>
        </Pressable>
        <Pressable style={[styles.btnSoft, { marginTop: 8 }]} onPress={importBackup}>
          <Text style={styles.btnSoftText}>Restore from file</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
