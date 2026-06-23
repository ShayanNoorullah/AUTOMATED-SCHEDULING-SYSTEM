import { useState } from "react";
import {
  Alert,
  FlatList,
  Linking,
  Pressable,
  Text,
  View,
} from "react-native";
import { useNavigation } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { api } from "../../src/api/endpoints";
import { EmptyState } from "../../src/components/EmptyState";
import { IconButton } from "../../src/components/IconButton";
import { ListCard } from "../../src/components/ListCard";
import { SearchBar } from "../../src/components/SearchBar";
import { useData } from "../../src/context/DataContext";
import { replaceTokens } from "../../src/lib/messageTokens";
import { formatRelativeTime } from "../../src/lib/time";
import { buildContactUrl, contactMessage } from "../../src/lib/whatsappLinks";
import { openEditScreen } from "../../src/lib/openEditScreen";
import type { Contact, ReleaseTarget } from "../../src/types";
import { styles } from "../../src/theme";
import { useTheme } from "../../src/context/ThemeContext";
import { useLayout } from "../../src/hooks/useLayout";

export default function ContactsScreen() {
  useTheme();
  const navigation = useNavigation();
  const { width } = useLayout();
  const numColumns = width > 600 ? 2 : 1;
  const { contacts, refresh, loading } = useData();
  const [q, setQ] = useState("");
  const [sending, setSending] = useState(false);

  const filtered = contacts.filter(
    (c) => !q || c.name.toLowerCase().includes(q.toLowerCase()) || (c.phone || "").includes(q)
  );

  function fullIndex(item: Contact) {
    return contacts.findIndex((c) => c.name === item.name && c.phone === item.phone);
  }

  function openNew() {
    openEditScreen(navigation, "/edit/contact", { mode: "new" });
  }

  function openContact(item: Contact) {
    const i = fullIndex(item);
    if (i < 0) return;
    openEditScreen(navigation, "/edit/contact", { index: String(i) });
  }

  async function remove(item: Contact) {
    const i = fullIndex(item);
    if (i < 0) return;
    Alert.alert("Delete", `Delete contact "${item.name}"?`, [
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

  return (
    <View style={styles.screen}>
      <FlatList
        data={filtered}
        key={`contacts-${numColumns}`}
        keyExtractor={(c, i) => `${c.name}-${i}`}
        numColumns={numColumns}
        columnWrapperStyle={numColumns > 1 ? { gap: 12 } : undefined}
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
        renderItem={({ item }) => {
          const sent = item.lastReleased ? formatRelativeTime(item.lastReleased) : "";
          return (
            <View style={numColumns > 1 ? { flex: 1 } : undefined}>
              <ListCard
                title={item.name}
                subtitle={`+${item.phone}${sent ? ` · ✓ ${sent}` : ""}`}
                chevron
                onPress={() => openContact(item)}
                footer={
                  <View style={styles.row}>
                    <IconButton icon="logo-whatsapp" label="Open" onPress={() => openWa(item)} />
                    <IconButton icon="send-outline" label="Send" onPress={() => sendOne(item)} />
                    <IconButton icon="trash-outline" label="Delete" onPress={() => remove(item)} destructive />
                  </View>
                }
              />
            </View>
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
    </View>
  );
}
