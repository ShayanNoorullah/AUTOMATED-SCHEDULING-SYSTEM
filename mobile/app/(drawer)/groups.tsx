import { useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { api } from "../../src/api/endpoints";
import { EmptyState } from "../../src/components/EmptyState";
import { FormModal } from "../../src/components/FormModal";
import { IconButton } from "../../src/components/IconButton";
import { ListCard } from "../../src/components/ListCard";
import { SearchBar } from "../../src/components/SearchBar";
import { useData } from "../../src/context/DataContext";
import { emptyWeekSchedule, genMessage, messageFor, normalizeSchedule } from "../../src/lib/messageTokens";
import type { Group } from "../../src/types";
import { colors, styles } from "../../src/theme";

export default function GroupsScreen() {
  const { groups, refresh, loading } = useData();
  const [edit, setEdit] = useState<Group | null>(null);
  const [idx, setIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");

  const filtered = groups.filter((g) => !q || g.name.toLowerCase().includes(q.toLowerCase()));

  function openNew() {
    setIdx(null);
    setEdit({ name: "", schedule: emptyWeekSchedule(), message: "", inviteLink: "" });
  }

  function openGroup(g: Group, i: number) {
    setIdx(i);
    setEdit({ ...g, schedule: normalizeSchedule(g.schedule), inviteLink: g.inviteLink || "" });
  }

  async function save() {
    if (!edit?.name.trim()) {
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
      setEdit(null);
      await refresh();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(i: number, name: string) {
    Alert.alert("Delete group", `Delete "${name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await api.deleteGroup(i);
          await refresh();
        },
      },
    ]);
  }

  function regen() {
    if (!edit) return;
    setEdit({ ...edit, message: genMessage(edit.schedule) });
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={filtered}
        keyExtractor={(g, i) => `${g.name}-${i}`}
        refreshing={loading}
        onRefresh={refresh}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <>
            <SearchBar value={q} onChangeText={setQ} placeholder="Search groups…" />
            <Pressable style={styles.btn} onPress={openNew}>
              <Text style={styles.btnText}>+ New group</Text>
            </Pressable>
          </>
        }
        renderItem={({ item, index }) => (
          <ListCard
            title={item.name}
            subtitle={`${item.schedule?.filter((s) => s.from).length || 0} days scheduled`}
            icon="people-outline"
            onPress={() => openGroup(item, index)}
            footer={
              <View style={styles.row}>
                <IconButton icon="create-outline" label="Edit" onPress={() => openGroup(item, index)} />
                <IconButton icon="trash-outline" label="Delete" onPress={() => remove(index, item.name)} destructive />
              </View>
            }
          />
        )}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon="people-outline"
              title="No groups yet"
              message="Create a WhatsApp group entry to schedule and send messages."
              actionLabel="+ New group"
              onAction={openNew}
            />
          ) : null
        }
      />

      <FormModal
        visible={!!edit}
        title={idx === null ? "New group" : "Edit group"}
        onClose={() => setEdit(null)}
        footer={
          <View style={styles.row}>
            <Pressable style={[styles.btn, { flex: 1 }]} onPress={save} disabled={saving}>
              <Text style={styles.btnText}>{saving ? "Saving…" : "Save"}</Text>
            </Pressable>
            <Pressable style={[styles.btnSoft, { flex: 1 }]} onPress={() => setEdit(null)}>
              <Text style={styles.btnSoftText}>Cancel</Text>
            </Pressable>
          </View>
        }
      >
        <Text style={styles.label}>WhatsApp group name (exact match)</Text>
        <TextInput style={styles.input} value={edit?.name} onChangeText={(t) => setEdit((e) => e && { ...e, name: t })} />
        <Text style={styles.label}>Invite link (optional)</Text>
        <TextInput
          style={styles.input}
          value={edit?.inviteLink}
          onChangeText={(t) => setEdit((e) => e && { ...e, inviteLink: t })}
          placeholder="https://chat.whatsapp.com/..."
          autoCapitalize="none"
        />
        <Text style={styles.label}>Message preview</Text>
        <Text style={styles.hint}>{edit ? messageFor(edit).slice(0, 120) : ""}…</Text>
        <Text style={styles.label}>Custom message</Text>
        <TextInput
          style={[styles.input, { minHeight: 100, textAlignVertical: "top" }]}
          multiline
          value={edit?.message}
          onChangeText={(t) => setEdit((e) => e && { ...e, message: t })}
        />
        <Pressable style={styles.btnSoft} onPress={regen}>
          <Text style={styles.btnSoftText}>Regenerate from schedule</Text>
        </Pressable>
        <Text style={[styles.label, { marginTop: 16 }]}>Weekly schedule</Text>
        {edit?.schedule.map((day, di) => (
          <View key={day.day} style={styles.card}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
              <Switch
                value={!!day.from}
                onValueChange={(on) => {
                  setEdit((e) => {
                    if (!e) return e;
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
                      if (!e) return e;
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
                      if (!e) return e;
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
      </FormModal>
    </View>
  );
}
