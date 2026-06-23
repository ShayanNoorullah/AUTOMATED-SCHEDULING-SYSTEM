import { Alert, FlatList, Pressable, Text, View } from "react-native";
import { useNavigation } from "expo-router";
import { api } from "../../src/api/endpoints";
import { EmptyState } from "../../src/components/EmptyState";
import { IconButton } from "../../src/components/IconButton";
import { ListCard } from "../../src/components/ListCard";
import { useData } from "../../src/context/DataContext";
import { openEditScreen } from "../../src/lib/openEditScreen";
import { styles } from "../../src/theme";
import { useTheme } from "../../src/context/ThemeContext";

export default function TemplatesScreen() {
  useTheme();
  const navigation = useNavigation();
  const { templates, refresh, loading } = useData();

  function openNew() {
    openEditScreen(navigation, "/edit/template", { mode: "new" });
  }

  function openTemplate(index: number) {
    openEditScreen(navigation, "/edit/template", { index: String(index) });
  }

  async function remove(i: number, name: string) {
    Alert.alert("Delete", `Delete template "${name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await api.deleteTemplate(i);
          await refresh();
        },
      },
    ]);
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={templates}
        keyExtractor={(t, i) => `${t.name}-${i}`}
        refreshing={loading}
        onRefresh={refresh}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <Pressable style={styles.btn} onPress={openNew}>
            <Text style={styles.btnText}>+ New template</Text>
          </Pressable>
        }
        renderItem={({ item, index }) => (
          <ListCard
            title={item.name}
            subtitle={item.content}
            icon="document-text-outline"
            onPress={() => openTemplate(index)}
            footer={
              <>
                {item.isDefault ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>Default</Text>
                  </View>
                ) : (
                  <IconButton icon="trash-outline" label="Delete" onPress={() => remove(index, item.name)} destructive />
                )}
              </>
            }
          />
        )}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon="document-text-outline"
              title="No templates"
              message="Create reusable message snippets for groups and contacts."
              actionLabel="+ New template"
              onAction={openNew}
            />
          ) : null
        }
      />
    </View>
  );
}
