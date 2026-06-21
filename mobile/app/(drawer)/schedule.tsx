import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api/endpoints";
import { EmptyState } from "../../src/components/EmptyState";
import { useData } from "../../src/context/DataContext";
import { normalizeSchedule } from "../../src/lib/messageTokens";
import type { Group } from "../../src/types";
import { colors, styles } from "../../src/theme";

export default function ScheduleScreen() {
  const { groups, refresh, setGroups } = useData();
  const [local, setLocal] = useState<Group[] | null>(null);
  const [saving, setSaving] = useState(false);

  const data = local ?? groups;

  function updateDay(gi: number, di: number, field: "from" | "to", value: string) {
    setLocal((prev) => {
      const base = [...(prev ?? groups)];
      const g = { ...base[gi], schedule: normalizeSchedule([...base[gi].schedule]) };
      const schedule = [...g.schedule];
      schedule[di] = { ...schedule[di], [field]: value };
      base[gi] = { ...g, schedule };
      return base;
    });
  }

  async function save() {
    setSaving(true);
    try {
      const payload = (local ?? groups).map((g) => ({
        ...g,
        schedule: normalizeSchedule(g.schedule),
      }));
      await api.saveAllGroups(payload);
      setLocal(null);
      setGroups(payload);
      Alert.alert("Saved", "Schedule table updated");
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (!data.length) {
    return (
      <View style={styles.screen}>
        <EmptyState
          icon="calendar-outline"
          title="No schedule yet"
          message="Add groups first from the Groups section in the sidebar."
        />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.subtitle}>Edit times per group. Tap Save when done.</Text>
      {data.map((g, gi) => (
        <View key={g.name} style={styles.card}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Ionicons name="calendar-outline" size={18} color={colors.accent} />
            <Text style={styles.listTitle}>{g.name}</Text>
          </View>
          {normalizeSchedule(g.schedule).map((day, di) => (
            <View key={day.day} style={{ marginTop: 10 }}>
              <Text style={styles.label}>{day.day}</Text>
              <View style={styles.row}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  placeholder="From"
                  value={day.from}
                  onChangeText={(t) => updateDay(gi, di, "from", t)}
                />
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  placeholder="To"
                  value={day.to}
                  onChangeText={(t) => updateDay(gi, di, "to", t)}
                />
              </View>
            </View>
          ))}
        </View>
      ))}
      <Pressable style={styles.btn} onPress={save} disabled={saving}>
        <Text style={styles.btnText}>{saving ? "Saving…" : "Save schedule"}</Text>
      </Pressable>
      {local ? (
        <Pressable style={[styles.btnSoft, { marginTop: 8 }]} onPress={() => setLocal(null)}>
          <Text style={styles.btnSoftText}>Discard changes</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}
