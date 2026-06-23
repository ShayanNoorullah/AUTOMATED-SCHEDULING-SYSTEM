import { useCallback, useState } from "react";
import { Alert, FlatList, Pressable, Text, View } from "react-native";
import { api } from "../../src/api/endpoints";
import { EmptyState } from "../../src/components/EmptyState";
import { useTheme } from "../../src/context/ThemeContext";
import { formatRelativeTime } from "../../src/lib/time";
import { colors, styles } from "../../src/theme";

type Item = {
  id: number;
  targetName: string;
  targetType: string;
  status: string;
  at: string;
};

export default function HistoryScreen() {
  useTheme();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.releaseHistory(100);
      setItems(d.items);
    } catch {
      Alert.alert("Error", "Could not load send history");
    } finally {
      setLoading(false);
    }
  }, []);

  async function retry(id: number) {
    Alert.alert("Retry send", "Retry this failed delivery?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Retry",
        onPress: async () => {
          try {
            await api.releaseRetry(id);
            Alert.alert("Started", "Retry queued");
            load();
          } catch (e) {
            Alert.alert("Error", e instanceof Error ? e.message : "Retry failed");
          }
        },
      },
    ]);
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        refreshing={loading}
        onRefresh={load}
        onLayout={load}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <Pressable style={[styles.btnSoft, { alignSelf: "flex-start", marginBottom: 12 }]} onPress={load}>
            <Text style={styles.btnSoftText}>Refresh</Text>
          </Pressable>
        }
        renderItem={({ item }) => (
          <View style={[styles.listItem, { marginBottom: 10 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "700",
                  color: item.status === "success" ? colors.success : colors.error,
                  textTransform: "uppercase",
                }}
              >
                {item.status}
              </Text>
              <Text style={styles.listTitle}>{item.targetName}</Text>
            </View>
            <Text style={styles.listSub}>
              {item.targetType} · {item.at ? formatRelativeTime(item.at) : ""}
            </Text>
            {item.status !== "success" ? (
              <Pressable style={[styles.btnSoft, { marginTop: 8, alignSelf: "flex-start" }]} onPress={() => retry(item.id)}>
                <Text style={styles.btnSoftText}>Retry</Text>
              </Pressable>
            ) : null}
          </View>
        )}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon="time-outline"
              title="No send history"
              message="Automated sends will appear here with status and retry options."
              actionLabel="Refresh"
              onAction={load}
            />
          ) : null
        }
      />
    </View>
  );
}
