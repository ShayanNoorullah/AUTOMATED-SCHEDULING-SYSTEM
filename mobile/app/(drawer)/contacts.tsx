import { useState } from "react";
import {
  Alert,
  FlatList,
  Linking,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { api } from "../../src/api/endpoints";
import { EmptyState } from "../../src/components/EmptyState";
import { FormModal } from "../../src/components/FormModal";
import { IconButton, PickerChip, SimplePicker } from "../../src/components/IconButton";
import { ListCard } from "../../src/components/ListCard";
import { SearchBar } from "../../src/components/SearchBar";
import { useData } from "../../src/context/DataContext";
import { messageFor, replaceTokens } from "../../src/lib/messageTokens";
import { formatRelativeTime } from "../../src/lib/time";
import { buildContactUrl, contactMessage } from "../../src/lib/whatsappLinks";
import type { Contact, ReleaseTarget } from "../../src/types";
import { colors, styles } from "../../src/theme";

export default function ContactsScreen() {
  const { contacts, groups, templates, refresh, loading } = useData();
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<{ name: string; phone: string; message: string } | null>(null);
  const [idx, setIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [groupPicker, setGroupPicker] = useState(false);
  const [tplPicker, setTplPicker] = useState(false);
  const [sending, setSending] = useState(false);

  const filtered = contacts.filter(
    (c) => !q || c.name.toLowerCase().includes(q.toLowerCase()) || (c.phone || "").includes(q)
  );

  function openNew() {
    setIdx(null);
    setEdit({ name: "", phone: "", message: "" });
  }

  function openContact(c: Contact, i: number) {
    setIdx(i);
    setEdit({ name: c.name, phone: c.phone, message: c.message || "" });
  }

  async function save() {
    if (!edit?.name.trim() || !edit.phone.trim()) {
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
      setEdit(null);
      await refresh();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(i: number, name: string) {
    Alert.alert("Delete", `Delete contact "${name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await api.deleteContact(i);
          await refresh();
        },
      },
    ]);
  }

  async function openWa(c: Contact) {
    const msg = contactMessage(c);
    await Clipboard.setStringAsync(msg);
    const url = buildContactUrl(c.phone, msg);
    if (!url) {
      Alert.alert("Error", "Invalid phone number");
      return;
    }
    await api.directLog(c.name, "contact").catch(() => {});
    Linking.openURL(url).catch(() => Alert.alert("Error", "Could not open WhatsApp"));
  }

  function contactTarget(c: Contact): ReleaseTarget | null {
    const msg = replaceTokens(c.message || "");
    if (!msg.trim()) return null;
    return { name: c.name, phone: c.phone, message: msg };
  }

  async function sendOne(c: Contact) {
    const t = contactTarget(c);
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

  async function sendAll() {
    const targets = contacts.map(contactTarget).filter(Boolean) as ReleaseTarget[];
    if (!targets.length) {
      Alert.alert("Nothing to send", "No contacts with message content");
      return;
    }
    Alert.alert("Send all", `Send to ${targets.length} contact(s)?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Send",
        onPress: async () => {
          setSending(true);
          try {
            await api.release(targets);
            Alert.alert("Started", "Automated send queued");
            await refresh();
          } catch (e) {
            Alert.alert("Error", e instanceof Error ? e.message : "Send failed");
          } finally {
            setSending(false);
          }
        },
      },
    ]);
  }

  async function copyMessage() {
    if (!edit?.message) return;
    await Clipboard.setStringAsync(edit.message);
    Alert.alert("Copied", "Message copied to clipboard");
  }

  function loadGroupMessage(indexStr: string) {
    const i = parseInt(indexStr, 10);
    const g = groups[i];
    if (!g || !edit) return;
    setEdit({ ...edit, message: replaceTokens(messageFor(g)) });
  }

  function insertTemplate(indexStr: string) {
    const i = parseInt(indexStr, 10);
    const t = templates[i];
    if (!t || !edit) return;
    setEdit({ ...edit, message: replaceTokens(t.content) });
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={filtered}
        keyExtractor={(c, i) => `${c.name}-${i}`}
        refreshing={loading}
        onRefresh={refresh}
        contentContainerStyle={[styles.content, { paddingBottom: 88 }]}
        ListHeaderComponent={
          <>
            <SearchBar value={q} onChangeText={setQ} placeholder="Search contacts…" />
            <View style={styles.row}>
              <Pressable style={[styles.btnSoft, { flex: 1 }]} onPress={sendAll} disabled={sending}>
                <Text style={styles.btnSoftText}>Automated all</Text>
              </Pressable>
              <Pressable style={[styles.btn, { flex: 1 }]} onPress={openNew}>
                <Text style={styles.btnText}>+ New</Text>
              </Pressable>
            </View>
          </>
        }
        renderItem={({ item, index }) => {
          const sent = item.lastReleased ? formatRelativeTime(item.lastReleased) : "";
          return (
            <ListCard
              title={item.name}
              subtitle={`+${item.phone}${sent ? ` · ✓ ${sent}` : ""}`}
              icon="person-outline"
              onPress={() => openContact(item, index)}
              footer={
                <View style={styles.row}>
                  <IconButton icon="logo-whatsapp" label="Open" onPress={() => openWa(item)} />
                  <IconButton icon="send-outline" label="Send" onPress={() => sendOne(item)} />
                  <IconButton icon="trash-outline" label="Delete" onPress={() => remove(index, item.name)} destructive />
                </View>
              }
            />
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon="person-outline"
              title="No contacts yet"
              message="Save people and send messages via automation or direct WhatsApp links."
              actionLabel="+ New contact"
              onAction={openNew}
            />
          ) : null
        }
      />

      <Pressable style={styles.fab} onPress={openNew} accessibilityLabel="Add contact">
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>

      <FormModal
        visible={!!edit}
        title={idx === null ? "New contact" : "Edit contact"}
        onClose={() => setEdit(null)}
        footer={
          <View style={styles.row}>
            <Pressable style={[styles.btn, { flex: 1 }]} onPress={save} disabled={saving}>
              <Text style={styles.btnText}>{saving ? "Saving…" : "Save"}</Text>
            </Pressable>
            {idx !== null ? (
              <Pressable
                style={[styles.btnSoft, { flex: 1 }]}
                onPress={() => {
                  const c = contacts[idx];
                  if (c) sendOne(c);
                }}
                disabled={sending}
              >
                <Text style={styles.btnSoftText}>Send</Text>
              </Pressable>
            ) : null}
          </View>
        }
      >
        <Text style={styles.label}>Name</Text>
        <TextInput style={styles.input} value={edit?.name} onChangeText={(t) => setEdit((e) => e && { ...e, name: t })} />
        <Text style={styles.label}>Phone (with country code)</Text>
        <TextInput
          style={styles.input}
          value={edit?.phone}
          onChangeText={(t) => setEdit((e) => e && { ...e, phone: t })}
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
          value={edit?.message}
          onChangeText={(t) => setEdit((e) => e && { ...e, message: t })}
        />
        <Text style={styles.hint}>Tokens: {"{date}"}, {"{weekday}"}, {"{time}"} — *bold* with asterisks</Text>
      </FormModal>

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
    </View>
  );
}
