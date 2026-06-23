import { useEffect, useState } from "react";
import { Alert, Pressable, Switch, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { api } from "../../src/api/endpoints";
import { EditScreenLayout } from "../../src/components/EditScreenLayout";
import { SimplePicker } from "../../src/components/IconButton";
import { MessagePreview } from "../../src/components/MessagePreview";
import { useData } from "../../src/context/DataContext";
import { useTheme } from "../../src/context/ThemeContext";
import { emptyWeekSchedule, genMessage, messageFor, normalizeSchedule } from "../../src/lib/messageTokens";
import type { Group } from "../../src/types";
import { colors, styles } from "../../src/theme";

function initialGroup(groups: Group[], index: number | null): Group {
  if (index === null || index < 0) {
    return { name: "", schedule: emptyWeekSchedule(), message: "", inviteLink: "" };
  }
  const g = groups[index];
  if (!g) return { name: "", schedule: emptyWeekSchedule(), message: "", inviteLink: "" };
  return { ...g, schedule: normalizeSchedule(g.schedule), inviteLink: g.inviteLink || "" };
}

export default function GroupEditScreen() {
  useTheme();
  const { index: indexParam, mode } = useLocalSearchParams<{ index?: string; mode?: string }>();
  const { groups, refresh } = useData();
  const isNew = mode === "new";
  const idx = isNew ? null : indexParam !== undefined ? parseInt(indexParam, 10) : null;

  const [edit, setEdit] = useState<Group>(() => initialGroup(groups, idx));
  const [saving, setSaving] = useState(false);
  const [waPicker, setWaPicker] = useState(false);
  const [waGroups, setWaGroups] = useState<{ id: string; name: string }[]>([]);
  const [nameStatus, setNameStatus] = useState<{ ok?: boolean | null; hint?: string } | null>(null);

  useEffect(() => {
    const name = edit.name.trim();
    if (!name) {
      setNameStatus(null);
      return;
    }
    const t = setTimeout(() => {
      api
        .validateGroupNames([name])
        .then((d) => {
          const v = d.validation[name];
          if (!v || v.ok === null) {
            setNameStatus({ ok: null, hint: v?.note || "" });
          } else if (v.ok) {
            setNameStatus({
              ok: true,
              hint: v.match && v.match !== name ? `Matched: ${v.match}` : "Found in WhatsApp",
            });
          } else {
            setNameStatus({
              ok: false,
              hint: v.similar?.length ? `Not found. Similar: ${v.similar.join(", ")}` : "Not found in WhatsApp",
            });
          }
        })
        .catch(() => setNameStatus(null));
    }, 400);
    return () => clearTimeout(t);
  }, [edit.name]);

  async function fetchWaGroups() {
    try {
      const d = await api.waGroups();
      setWaGroups(d.groups || []);
      setWaPicker(true);
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not load WhatsApp groups");
    }
  }

  async function save() {
    if (!edit.name.trim()) {
      Alert.alert("Error", "Group name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: edit.name.trim(),
        schedule: edit.schedule,
        message: edit.message,
        inviteLink: edit.inviteLink?.trim() || "",
      };
      if (idx === null) await api.createGroup(payload);
      else await api.updateGroup(idx, payload);
      await refresh();
      router.back();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function regen() {
    setEdit((e) => ({ ...e, message: genMessage(e.schedule) }));
  }

  return (
    <>
      <EditScreenLayout
        title={idx === null ? "New group" : "Edit group"}
        onClose={() => router.back()}
        footer={
          <View style={styles.row}>
            <Pressable style={[styles.btn, { flex: 1 }]} onPress={save} disabled={saving}>
              <Text style={styles.btnText}>{saving ? "Saving…" : "Save"}</Text>
            </Pressable>
            <Pressable style={[styles.btnSoft, { flex: 1 }]} onPress={() => router.back()}>
              <Text style={styles.btnSoftText}>Cancel</Text>
            </Pressable>
          </View>
        }
      >
        <Text style={styles.label}>WhatsApp group name (exact match)</Text>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, { flex: 1, marginBottom: 0 }]}
            value={edit.name}
            onChangeText={(t) => setEdit((e) => ({ ...e, name: t }))}
          />
          <Pressable style={styles.btnSoft} onPress={fetchWaGroups}>
            <Text style={styles.btnSoftText}>Fetch WA</Text>
          </Pressable>
        </View>
        {nameStatus ? (
          <Text
            style={[
              styles.hint,
              { color: nameStatus.ok === false ? colors.error : nameStatus.ok ? colors.success : colors.muted },
            ]}
          >
            {nameStatus.ok === true ? "✓ " : nameStatus.ok === false ? "✗ " : ""}
            {nameStatus.hint}
          </Text>
        ) : null}
        <Text style={styles.label}>Invite link (optional)</Text>
        <TextInput
          style={styles.input}
          value={edit.inviteLink}
          onChangeText={(t) => setEdit((e) => ({ ...e, inviteLink: t }))}
          placeholder="https://chat.whatsapp.com/..."
          autoCapitalize="none"
        />
        <Text style={styles.label}>Message preview</Text>
        <Text style={styles.hint}>{messageFor(edit).slice(0, 120)}…</Text>
        <Text style={styles.label}>Custom message</Text>
        <TextInput
          style={[styles.input, { minHeight: 100, textAlignVertical: "top" }]}
          multiline
          value={edit.message}
          onChangeText={(t) => setEdit((e) => ({ ...e, message: t }))}
        />
        <MessagePreview message={edit.message || messageFor(edit)} />
        <Pressable style={styles.btnSoft} onPress={regen}>
          <Text style={styles.btnSoftText}>Regenerate from schedule</Text>
        </Pressable>
        <Text style={[styles.label, { marginTop: 16 }]}>Weekly schedule</Text>
        {edit.schedule.map((day, di) => (
          <View key={day.day} style={styles.card}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
              <Switch
                value={!!day.from}
                onValueChange={(on) => {
                  setEdit((e) => {
                    const schedule = [...e.schedule];
                    schedule[di] = on
                      ? { ...schedule[di], from: schedule[di].from || "9:00am", to: schedule[di].to || "10:00am" }
                      : { ...schedule[di], from: "", to: "" };
                    return { ...e, schedule };
                  });
                }}
                trackColor={{ true: colors.accent }}
              />
              <Text style={{ marginLeft: 8, fontWeight: "600" }}>{day.day}</Text>
            </View>
            {day.from ? (
              <View style={styles.row}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  placeholder="From"
                  value={day.from}
                  onChangeText={(t) => {
                    setEdit((e) => {
                      const schedule = [...e.schedule];
                      schedule[di] = { ...schedule[di], from: t };
                      return { ...e, schedule };
                    });
                  }}
                />
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  placeholder="To"
                  value={day.to}
                  onChangeText={(t) => {
                    setEdit((e) => {
                      const schedule = [...e.schedule];
                      schedule[di] = { ...schedule[di], to: t };
                      return { ...e, schedule };
                    });
                  }}
                />
              </View>
            ) : null}
          </View>
        ))}
      </EditScreenLayout>

      <SimplePicker
        visible={waPicker}
        title="Pick WhatsApp group"
        items={waGroups.map((g) => ({ label: g.name, value: g.name }))}
        onSelect={(name) => setEdit((e) => ({ ...e, name }))}
        onClose={() => setWaPicker(false)}
      />
    </>
  );
}
