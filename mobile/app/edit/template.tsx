import { useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { api } from "../../src/api/endpoints";
import { EditScreenLayout } from "../../src/components/EditScreenLayout";
import { useData } from "../../src/context/DataContext";
import { useTheme } from "../../src/context/ThemeContext";
import { styles } from "../../src/theme";

export default function TemplateEditScreen() {
  useTheme();
  const { index: indexParam, mode } = useLocalSearchParams<{ index?: string; mode?: string }>();
  const { templates, refresh } = useData();
  const isNew = mode === "new";
  const idx = isNew ? null : indexParam !== undefined ? parseInt(indexParam, 10) : null;

  const [edit, setEdit] = useState(() => {
    if (idx === null || idx < 0) return { name: "", content: "" };
    const t = templates[idx];
    return t ? { name: t.name, content: t.content } : { name: "", content: "" };
  });

  async function save() {
    if (!edit.name.trim()) return;
    try {
      if (idx === null) await api.createTemplate(edit.name.trim(), edit.content);
      else await api.updateTemplate(idx, edit.name.trim(), edit.content);
      await refresh();
      router.back();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Save failed");
    }
  }

  return (
    <EditScreenLayout
      title={idx === null ? "New template" : "Edit template"}
      onClose={() => router.back()}
      footer={
        <View style={styles.row}>
          <Pressable style={[styles.btn, { flex: 1 }]} onPress={save}>
            <Text style={styles.btnText}>Save</Text>
          </Pressable>
          <Pressable style={[styles.btnSoft, { flex: 1 }]} onPress={() => router.back()}>
            <Text style={styles.btnSoftText}>Cancel</Text>
          </Pressable>
        </View>
      }
    >
      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} value={edit.name} onChangeText={(t) => setEdit((e) => ({ ...e, name: t }))} />
      <Text style={styles.label}>Content</Text>
      <TextInput
        style={[styles.input, { minHeight: 160, textAlignVertical: "top" }]}
        multiline
        value={edit.content}
        onChangeText={(t) => setEdit((e) => ({ ...e, content: t }))}
      />
      <Text style={styles.hint}>Tokens: {"{date}"}, {"{weekday}"}, {"{time}"}</Text>
    </EditScreenLayout>
  );
}
