import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api/endpoints";
import { usePreferences } from "../context/PreferencesContext";
import { useLayout } from "../hooks/useLayout";
import { genMessage, normalizeSchedule, WEEKDAYS } from "../lib/messageTokens";
import { TIME_SLOTS } from "../lib/timeSlots";
import type { Group, ScheduleEntry } from "../types";
import { colors, radii, spacing, styles } from "../theme";

const DAY_COL_W = 76;
const COL_W_PORTRAIT = 132;
const COL_W_LANDSCAPE = 168;
const ROW_H = 52;

type Props = {
  groups: Group[];
  onSaved: (groups: Group[]) => void;
};

function padSchedule(schedule: ScheduleEntry[]): ScheduleEntry[] {
  const norm = normalizeSchedule(schedule || []);
  return WEEKDAYS.map((day) => {
    const found = norm.find((e) => e.day === day);
    return found || { day, from: "", to: "" };
  });
}

function groupsWithPaddedSchedules(groups: Group[]): Group[] {
  return groups.map((g) => ({ ...g, schedule: padSchedule(g.schedule) }));
}

export function ScheduleGrid({ groups: initial, onSaved }: Props) {
  const { prefs } = usePreferences();
  const { isLandscape } = useLayout();
  const colW = isLandscape ? COL_W_LANDSCAPE : COL_W_PORTRAIT;
  const [groups, setGroups] = useState<Group[]>(() => groupsWithPaddedSchedules(initial));
  const [selected, setSelected] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(initial.map((_, i) => [i, true]))
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [timePicker, setTimePicker] = useState<{
    gi: number;
    day: string;
    field: "from" | "to";
  } | null>(null);
  const [addName, setAddName] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    setGroups(groupsWithPaddedSchedules(initial));
    setSelected(Object.fromEntries(initial.map((_, i) => [i, true])));
    setDirty(false);
  }, [initial]);

  const bodyScrollRefs = useRef<(ScrollView | null)[]>([]);
  const headerScrollRef = useRef<ScrollView | null>(null);
  const syncing = useRef(false);

  const syncHorizontal = (x: number, source: "header" | number) => {
    if (syncing.current) return;
    syncing.current = true;
    if (source !== "header") headerScrollRef.current?.scrollTo({ x, animated: false });
    bodyScrollRefs.current.forEach((ref, i) => {
      if (source !== i) ref?.scrollTo({ x, animated: false });
    });
    syncing.current = false;
  };

  const onHScroll =
    (source: "header" | number) => (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      syncHorizontal(e.nativeEvent.contentOffset.x, source);
    };

  const updateCell = useCallback((gi: number, day: string, field: "from" | "to", value: string) => {
    setGroups((prev) => {
      const next = prev.map((g, i) => {
        if (i !== gi) return g;
        const schedule = [...padSchedule(g.schedule)];
        const di = schedule.findIndex((e) => e.day === day);
        const entry = { ...schedule[di], [field]: value.trim() };
        if (!entry.from && !entry.to) {
          schedule[di] = { day, from: "", to: "" };
        } else {
          schedule[di] = entry;
        }
        return { ...g, schedule };
      });
      return next;
    });
    setDirty(true);
  }, []);

  const renameGroup = (gi: number, name: string) => {
    setGroups((prev) => prev.map((g, i) => (i === gi ? { ...g, name } : g)));
    setDirty(true);
  };

  const addColumn = () => {
    setAddName("");
    setShowAdd(true);
  };

  const confirmAddColumn = () => {
    const name = addName.trim();
    if (!name) return;
    setGroups((prev) => [...prev, { name, schedule: padSchedule([]), message: "" }]);
    setSelected((s) => ({ ...s, [groups.length]: true }));
    setDirty(true);
    setShowAdd(false);
  };

  const removeColumn = (gi: number) => {
    const name = groups[gi]?.name;
    Alert.alert("Remove column", `Remove "${name}"? Save table to persist.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          setGroups((prev) => prev.filter((_, i) => i !== gi));
          setSelected({});
          setDirty(true);
        },
      },
    ]);
  };

  const saveTable = async (): Promise<boolean> => {
    for (const g of groups) {
      if (!g.name?.trim()) {
        Alert.alert("Error", "Every column needs a group name");
        return false;
      }
    }
    setSaving(true);
    try {
      const payload = groups.map((g) => ({
        ...g,
        name: g.name.trim(),
        schedule: g.schedule.filter((e) => (e.from || "").trim() || (e.to || "").trim()),
      }));
      await api.saveAllGroups(payload);
      setGroups(groupsWithPaddedSchedules(payload));
      onSaved(payload);
      setDirty(false);
      return true;
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Save failed");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const releaseSelected = async () => {
    if (!(await saveTable())) return;
    const targets = groups
      .map((g, i) => ({ g, i }))
      .filter(({ i }) => selected[i])
      .map(({ g }) => ({ name: g.name, message: genMessage(normalizeSchedule(g.schedule)) }))
      .filter((t) => t.message.trim());
    if (!targets.length) {
      Alert.alert("Nothing to send", "Select groups with schedule times");
      return;
    }
    try {
      await api.release(targets);
      Alert.alert("Started", `Automated send queued for ${targets.length} group(s)`);
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Release failed");
    }
  };

  const zebra = prefs.tableZebra === "on";

  if (!groups.length) {
    return null;
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.card, { margin: spacing.md, marginBottom: spacing.sm, padding: spacing.md }]}>
        <View style={[styles.row, { marginTop: 0 }]}>
          <Pressable style={[styles.btnSoft, { flex: 1, minHeight: 40 }]} onPress={addColumn}>
            <Text style={styles.btnSoftText}>+ Add group</Text>
          </Pressable>
          <Pressable
            style={[styles.btnSoft, { flex: 1, minHeight: 40 }]}
            onPress={() => {
              const all: Record<number, boolean> = {};
              groups.forEach((_, i) => (all[i] = true));
              setSelected(all);
            }}
          >
            <Text style={styles.btnSoftText}>Select all</Text>
          </Pressable>
          <Pressable style={[styles.btnSoft, { flex: 1, minHeight: 40 }]} onPress={() => setSelected({})}>
            <Text style={styles.btnSoftText}>Clear</Text>
          </Pressable>
        </View>
        <View style={[styles.row, { marginTop: spacing.sm }]}>
          <Pressable style={[styles.btn, { flex: 1 }]} onPress={() => saveTable()} disabled={saving}>
            <Text style={styles.btnText}>{saving ? "Saving…" : dirty ? "Save table *" : "Save table"}</Text>
          </Pressable>
          <Pressable style={[styles.btnSoft, { flex: 1, minHeight: 44 }]} onPress={releaseSelected}>
            <Text style={[styles.btnSoftText, { color: colors.accent }]}>Automated selected</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: spacing.xl }}>
        {/* Header row */}
        <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <View style={{ width: DAY_COL_W, padding: spacing.sm, justifyContent: "flex-end" }}>
            <Text style={[styles.caption, { color: colors.muted }]}>Day</Text>
          </View>
          <ScrollView
            horizontal
            ref={headerScrollRef}
            showsHorizontalScrollIndicator={false}
            onScroll={onHScroll("header")}
            scrollEventThrottle={16}
          >
            <View style={{ flexDirection: "row" }}>
              {groups.map((g, gi) => (
                <View
                  key={`h-${gi}`}
                  style={{
                    width: colW,
                    padding: spacing.sm,
                    borderLeftWidth: 1,
                    borderLeftColor: colors.border,
                    backgroundColor: colors.surface2,
                  }}
                >
                  <Pressable
                    onPress={() => setSelected((s) => ({ ...s, [gi]: !s[gi] }))}
                    style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 }}
                  >
                    <Ionicons
                      name={selected[gi] ? "checkbox" : "square-outline"}
                      size={16}
                      color={colors.accent}
                    />
                    <Pressable onPress={() => removeColumn(gi)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={14} color={colors.error} />
                    </Pressable>
                  </Pressable>
                  <TextInput
                    style={[
                      styles.input,
                      { marginBottom: 0, paddingVertical: 6, fontSize: 12, fontWeight: "700" },
                    ]}
                    value={g.name}
                    onChangeText={(t) => renameGroup(gi, t)}
                    placeholder="Group name"
                  />
                </View>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Day rows */}
        {WEEKDAYS.map((day, rowIdx) => (
          <View
            key={day}
            style={{
              flexDirection: "row",
              minHeight: ROW_H,
              backgroundColor: zebra && rowIdx % 2 === 1 ? colors.surface2 : colors.surface,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <View
              style={{
                width: DAY_COL_W,
                padding: spacing.sm,
                justifyContent: "center",
                borderRightWidth: 1,
                borderRightColor: colors.border,
                backgroundColor: colors.surface2,
              }}
            >
              <Text style={[styles.listTitle, { fontSize: 12 }]}>{day.slice(0, 3)}</Text>
            </View>
            <ScrollView
              horizontal
              ref={(r) => {
                bodyScrollRefs.current[rowIdx] = r;
              }}
              showsHorizontalScrollIndicator={false}
              onScroll={onHScroll(rowIdx)}
              scrollEventThrottle={16}
            >
              <View style={{ flexDirection: "row" }}>
                {groups.map((g, gi) => {
                  const entry = padSchedule(g.schedule).find((e) => e.day === day)!;
                  const filled = !!(entry.from || entry.to);
                  return (
                    <View
                      key={`${gi}-${day}`}
                      style={{
                        width: colW,
                        padding: 4,
                        borderLeftWidth: 1,
                        borderLeftColor: colors.border,
                        backgroundColor: filled ? colors.accentSoft : "transparent",
                      }}
                    >
                      <Pressable
                        onPress={() => setTimePicker({ gi, day, field: "from" })}
                        style={{
                          borderWidth: 1,
                          borderColor: colors.border,
                          borderRadius: radii.sm,
                          padding: 4,
                          marginBottom: 2,
                          backgroundColor: colors.surface,
                        }}
                      >
                        <Text style={{ fontSize: 11, color: entry.from ? colors.text : colors.muted }} numberOfLines={1}>
                          {entry.from || "From"}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setTimePicker({ gi, day, field: "to" })}
                        style={{
                          borderWidth: 1,
                          borderColor: colors.border,
                          borderRadius: radii.sm,
                          padding: 4,
                          backgroundColor: colors.surface,
                        }}
                      >
                        <Text style={{ fontSize: 11, color: entry.to ? colors.text : colors.muted }} numberOfLines={1}>
                          {entry.to || "To"}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        ))}
      </ScrollView>

      <Modal visible={!!timePicker} transparent animationType="fade">
        <Pressable style={{ flex: 1, backgroundColor: colors.overlay }} onPress={() => setTimePicker(null)} />
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            maxHeight: "50%",
            backgroundColor: colors.surface,
            borderTopLeftRadius: radii.lg,
            borderTopRightRadius: radii.lg,
            padding: spacing.lg,
          }}
        >
          <Text style={styles.sectionTitle}>
            {timePicker?.field === "from" ? "From" : "To"} — {timePicker?.day}
          </Text>
          <ScrollView>
            <Pressable
              style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}
              onPress={() => {
                if (timePicker) {
                  updateCell(timePicker.gi, timePicker.day, timePicker.field, "");
                  setTimePicker(null);
                }
              }}
            >
              <Text style={{ color: colors.muted }}>Clear</Text>
            </Pressable>
            {TIME_SLOTS.map((slot) => (
              <Pressable
                key={slot}
                style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}
                onPress={() => {
                  if (timePicker) {
                    updateCell(timePicker.gi, timePicker.day, timePicker.field, slot);
                    setTimePicker(null);
                  }
                }}
              >
                <Text style={styles.listTitle}>{slot}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={showAdd} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "center", padding: spacing.lg }}>
          <View style={[styles.card, { marginBottom: 0 }]}>
            <Text style={styles.title}>New group column</Text>
            <Text style={styles.hint}>WhatsApp group name (exact match)</Text>
            <TextInput
              style={styles.input}
              value={addName}
              onChangeText={setAddName}
              autoFocus
              placeholder="Group name"
            />
            <View style={styles.row}>
              <Pressable style={[styles.btn, { flex: 1 }]} onPress={confirmAddColumn}>
                <Text style={styles.btnText}>Add</Text>
              </Pressable>
              <Pressable style={[styles.btnSoft, { flex: 1 }]} onPress={() => setShowAdd(false)}>
                <Text style={styles.btnSoftText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
