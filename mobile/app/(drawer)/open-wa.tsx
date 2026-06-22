import { useState } from "react";
import { Alert, FlatList, Linking, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { api } from "../../src/api/endpoints";
import { IconButton } from "../../src/components/IconButton";
import { ListCard } from "../../src/components/ListCard";
import { SearchBar } from "../../src/components/SearchBar";
import { useData } from "../../src/context/DataContext";
import {
  buildContactUrl,
  buildGroupDirectUrl,
  contactMessage,
  groupMessage,
} from "../../src/lib/whatsappLinks";
import { styles } from "../../src/theme";
import { useTheme } from "../../src/context/ThemeContext";

export default function OpenWaScreen() {
  useTheme();
  const { groups, contacts } = useData();
  const [q, setQ] = useState("");

  const filteredG = groups.filter((g) => !q || g.name.toLowerCase().includes(q.toLowerCase()));
  const filteredC = contacts.filter(
    (c) => !q || c.name.toLowerCase().includes(q.toLowerCase()) || (c.phone || "").includes(q)
  );

  async function openGroup(name: string) {
    const g = groups.find((x) => x.name === name);
    if (!g) return;
    const msg = groupMessage(g);
    await Clipboard.setStringAsync(msg);
    const url = buildGroupDirectUrl(g);
    await api.directLog(name, "group").catch(() => {});
    Linking.openURL(url).catch(() => Alert.alert("Error", "Could not open WhatsApp"));
    Alert.alert("Copied", "Message copied to clipboard. Paste in WhatsApp if needed.");
  }

  async function openContact(name: string) {
    const c = contacts.find((x) => x.name === name);
    if (!c) return;
    const msg = contactMessage(c);
    await Clipboard.setStringAsync(msg);
    const url = buildContactUrl(c.phone, msg);
    if (!url) {
      Alert.alert("Error", "Invalid phone number");
      return;
    }
    await api.directLog(name, "contact").catch(() => {});
    Linking.openURL(url).catch(() => Alert.alert("Error", "Could not open WhatsApp"));
  }

  return (
    <View style={styles.screen}>
      <FlatList
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <>
            <Text style={styles.subtitle}>Open chats in WhatsApp. Message is copied automatically.</Text>
            <SearchBar value={q} onChangeText={setQ} placeholder="Search groups & contacts…" />
            <Text style={[styles.sectionTitle, { marginTop: 4 }]}>Groups</Text>
          </>
        }
        data={filteredG}
        keyExtractor={(g) => g.name}
        renderItem={({ item }) => (
          <ListCard
            title={item.name}
            subtitle={item.inviteLink ? "Invite link set" : "Opens WhatsApp Web / app"}
            icon="people-outline"
            footer={<IconButton icon="logo-whatsapp" label="Open" onPress={() => openGroup(item.name)} />}
          />
        )}
        ListFooterComponent={
          <>
            <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Contacts</Text>
            {filteredC.length === 0 ? (
              <Text style={styles.hint}>No contacts match your search.</Text>
            ) : (
              filteredC.map((c) => (
                <ListCard
                  key={c.name}
                  title={c.name}
                  subtitle={`+${c.phone}`}
                  icon="person-outline"
                  footer={<IconButton icon="logo-whatsapp" label="Open" onPress={() => openContact(c.name)} />}
                />
              ))
            )}
          </>
        }
      />
    </View>
  );
}
