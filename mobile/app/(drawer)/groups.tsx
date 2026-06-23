import { useState } from "react";
import { Alert, FlatList, View } from "react-native";
import { useNavigation } from "expo-router";
import { api } from "../../src/api/endpoints";
import { EmptyState } from "../../src/components/EmptyState";
import { IconButton } from "../../src/components/IconButton";
import { ListCard } from "../../src/components/ListCard";
import { SearchBar } from "../../src/components/SearchBar";
import { useData } from "../../src/context/DataContext";
import { useTheme } from "../../src/context/ThemeContext";
import { Button, SkeletonList } from "../../src/components/ui";
import { openEditScreen } from "../../src/lib/openEditScreen";
import type { Group } from "../../src/types";
import { useLayout } from "../../src/hooks/useLayout";
import { styles } from "../../src/theme";

export default function GroupsScreen() {
  useTheme();
  const navigation = useNavigation();
  const { width } = useLayout();
  const numColumns = width > 600 ? 2 : 1;
  const { groups, refresh, loading } = useData();
  const [q, setQ] = useState("");

  const filtered = groups.filter((g) => !q || g.name.toLowerCase().includes(q.toLowerCase()));

  function fullIndex(item: Group) {
    return groups.findIndex((g) => g.name === item.name);
  }

  function openNew() {
    openEditScreen(navigation, "/edit/group", { mode: "new" });
  }

  function openGroup(item: Group) {
    const i = fullIndex(item);
    if (i < 0) return;
    openEditScreen(navigation, "/edit/group", { index: String(i) });
  }

  async function remove(item: Group) {
    const i = fullIndex(item);
    if (i < 0) return;
    Alert.alert("Delete group", `Delete "${item.name}"?`, [
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

  return (
    <View style={styles.screen}>
      <FlatList
        data={filtered}
        key={`groups-${numColumns}`}
        keyExtractor={(g, i) => `${g.name}-${i}`}
        numColumns={numColumns}
        columnWrapperStyle={numColumns > 1 ? { gap: 12 } : undefined}
        refreshing={loading}
        onRefresh={refresh}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <>
            <SearchBar value={q} onChangeText={setQ} placeholder="Search groups…" />
            <Button label="New group" icon="add" onPress={openNew} full />
          </>
        }
        renderItem={({ item }) => (
          <View style={numColumns > 1 ? { flex: 1 } : undefined}>
            <ListCard
              title={item.name}
              subtitle={`${item.schedule?.filter((s) => s.from).length || 0} days scheduled`}
              chevron
              onPress={() => openGroup(item)}
              footer={
                <View style={styles.row}>
                  <IconButton icon="create-outline" label="Edit" onPress={() => openGroup(item)} />
                  <IconButton icon="trash-outline" label="Delete" onPress={() => remove(item)} destructive />
                </View>
              }
            />
          </View>
        )}
        ListEmptyComponent={
          loading ? (
            <SkeletonList count={5} />
          ) : (
            <EmptyState
              icon="people-outline"
              title="No groups yet"
              message="Create a WhatsApp group entry to schedule and send messages."
              actionLabel="+ New group"
              onAction={openNew}
            />
          )
        }
      />
    </View>
  );
}
