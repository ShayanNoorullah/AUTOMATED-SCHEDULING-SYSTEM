import { useState } from "react";
import { Alert, FlatList, Pressable, Text, TextInput, View } from "react-native";
import { DrawerActions } from "@react-navigation/native";
import { useNavigation } from "expo-router";
import { api } from "../../src/api/endpoints";
import { EmptyState } from "../../src/components/EmptyState";
import { FormModal } from "../../src/components/FormModal";
import { IconButton } from "../../src/components/IconButton";
import { ListCard } from "../../src/components/ListCard";
import { useData } from "../../src/context/DataContext";
import { styles } from "../../src/theme";
import { useTheme } from "../../src/context/ThemeContext";

export default function TemplatesScreen() {
  useTheme();
  const navigation = useNavigation();
  const { templates, refresh, loading } = useData();
  const [edit, setEdit] = useState<{ name: string; content: string } | null>(null);
  const [idx, setIdx] = useState<number | null>(null);

  function closeDrawer() {
    navigation.dispatch(DrawerActions.closeDrawer());
  }

  function openNew() {
    closeDrawer();
    setIdx(null);
    setEdit({ name: "", content: "" });
  }

  function openTemplate(index: number, item: { name: string; content: string }) {
    closeDrawer();
    setIdx(index);
    setEdit({ name: item.name, content: item.content });
  }

  async function save() {
    if (!edit?.name.trim()) return;
    try {
      if (idx === null) await api.createTemplate(edit.name.trim(), edit.content);
      else await api.updateTemplate(idx, edit.name.trim(), edit.content);
      setEdit(null);
      await refresh();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Save failed");
    }
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
            onPress={() => openTemplate(index, item)}
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

      <FormModal
        visible={!!edit}
        title={idx === null ? "New template" : "Edit template"}
        onClose={() => setEdit(null)}
        onShow={closeDrawer}
        footer={
          <View style={styles.row}>
            <Pressable style={[styles.btn, { flex: 1 }]} onPress={save}>
              <Text style={styles.btnText}>Save</Text>
            </Pressable>
            <Pressable style={[styles.btnSoft, { flex: 1 }]} onPress={() => setEdit(null)}>
              <Text style={styles.btnSoftText}>Cancel</Text>
            </Pressable>
          </View>
        }
      >
        <Text style={styles.label}>Name</Text>
        <TextInput style={styles.input} value={edit?.name} onChangeText={(t) => setEdit((e) => e && { ...e, name: t })} />
        <Text style={styles.label}>Content</Text>
        <TextInput
          style={[styles.input, { minHeight: 160, textAlignVertical: "top" }]}
          multiline
          value={edit?.content}
          onChangeText={(t) => setEdit((e) => e && { ...e, content: t })}
        />
        <Text style={styles.hint}>Tokens: {"{date}"}, {"{weekday}"}, {"{time}"}</Text>
      </FormModal>
    </View>
  );
}
