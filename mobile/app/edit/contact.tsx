import { useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { api } from "../../src/api/endpoints";
import { EditScreenLayout } from "../../src/components/EditScreenLayout";
import { PickerChip, SimplePicker } from "../../src/components/IconButton";
import { MessagePreview } from "../../src/components/MessagePreview";
import { useData } from "../../src/context/DataContext";
import { useTheme } from "../../src/context/ThemeContext";
import { messageFor, replaceTokens } from "../../src/lib/messageTokens";
import type { Contact, ReleaseTarget } from "../../src/types";
import { styles } from "../../src/theme";

function initialContact(contacts: Contact[], index: number | null) {
  if (index === null || index < 0) return { name: "", phone: "", message: "" };
  const c = contacts[index];
  if (!c) return { name: "", phone: "", message: "" };
  return { name: c.name, phone: c.phone, message: c.message || "" };
}

export default function ContactEditScreen() {
  useTheme();
  const { index: indexParam, mode } = useLocalSearchParams<{ index?: string; mode?: string }>();
  const { contacts, groups, templates, refresh } = useData();
  const isNew = mode === "new";
  const idx = isNew ? null : indexParam !== undefined ? parseInt(indexParam, 10) : null;

  const [edit, setEdit] = useState(() => initialContact(contacts, idx));
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [groupPicker, setGroupPicker] = useState(false);
  const [tplPicker, setTplPicker] = useState(false);

  async function save() {
    if (!edit.name.trim() || !edit.phone.trim()) {
      Alert.alert("Error", "Name and phone required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: edit.name.trim(),
        phone: edit.phone.replace(/\D/g, ""),
        message: edit.message,
      };
      if (idx === null) await api.createContact(payload);
      else await api.updateContact(idx, payload);
      await refresh();
      router.back();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function contactTarget(): ReleaseTarget | null {
    const msg = replaceTokens(edit.message || "");
    if (!msg.trim()) return null;
    return { name: edit.name, phone: edit.phone, message: msg };
  }

  async function sendOne() {
    const t = contactTarget();
    if (!t) {
      Alert.alert("Empty message", "Add a message before sending");
      return;
    }
    setSending(true);
    try {
      await api.release([t]);
      Alert.alert("Started", "Automated send queued");
      await refresh();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  async function copyMessage() {
    if (!edit.message) return;
    await Clipboard.setStringAsync(edit.message);
    Alert.alert("Copied", "Message copied to clipboard");
  }

  function loadGroupMessage(indexStr: string) {
    const i = parseInt(indexStr, 10);
    const g = groups[i];
    if (!g) return;
    setEdit((e) => ({ ...e, message: replaceTokens(messageFor(g)) }));
  }

  function insertTemplate(indexStr: string) {
    const i = parseInt(indexStr, 10);
    const t = templates[i];
    if (!t) return;
    setEdit((e) => ({ ...e, message: replaceTokens(t.content) }));
  }

  return (
    <>
      <EditScreenLayout
        title={idx === null ? "New contact" : "Edit contact"}
        onClose={() => router.back()}
        footer={
          <View style={styles.row}>
            <Pressable style={[styles.btn, { flex: 1 }]} onPress={save} disabled={saving}>
              <Text style={styles.btnText}>{saving ? "Saving…" : "Save"}</Text>
            </Pressable>
            {idx !== null ? (
              <Pressable style={[styles.btnSoft, { flex: 1 }]} onPress={sendOne} disabled={sending}>
                <Text style={styles.btnSoftText}>Send</Text>
              </Pressable>
            ) : null}
          </View>
        }
      >
        <Text style={styles.label}>Name</Text>
        <TextInput style={styles.input} value={edit.name} onChangeText={(t) => setEdit((e) => ({ ...e, name: t }))} />
        <Text style={styles.label}>Phone (with country code)</Text>
        <TextInput
          style={styles.input}
          value={edit.phone}
          onChangeText={(t) => setEdit((e) => ({ ...e, phone: t }))}
          keyboardType="phone-pad"
        />
        <Text style={styles.hint}>Digits only — include country code, no + or spaces</Text>
        <Text style={styles.label}>Message</Text>
        <View style={[styles.row, { marginBottom: 8 }]}>
          <PickerChip label="Load group message" onPress={() => setGroupPicker(true)} />
          <PickerChip label="Insert template" onPress={() => setTplPicker(true)} />
          <PickerChip label="Copy" onPress={copyMessage} />
        </View>
        <TextInput
          style={[styles.input, { minHeight: 120, textAlignVertical: "top" }]}
          multiline
          value={edit.message}
          onChangeText={(t) => setEdit((e) => ({ ...e, message: t }))}
        />
        <MessagePreview message={edit.message || ""} />
        <Text style={styles.hint}>Tokens: {"{date}"}, {"{weekday}"}, {"{time}"} — *bold* with asterisks</Text>
      </EditScreenLayout>

      <SimplePicker
        visible={groupPicker}
        title="Load group message"
        items={groups.map((g, i) => ({ label: g.name, value: String(i) }))}
        onSelect={loadGroupMessage}
        onClose={() => setGroupPicker(false)}
      />
      <SimplePicker
        visible={tplPicker}
        title="Insert template"
        items={templates.map((t, i) => ({ label: t.name, value: String(i) }))}
        onSelect={insertTemplate}
        onClose={() => setTplPicker(false)}
      />
    </>
  );
}
