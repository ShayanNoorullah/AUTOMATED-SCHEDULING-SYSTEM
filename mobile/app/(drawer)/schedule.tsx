import { View } from "react-native";
import { ScheduleGrid } from "../../src/components/ScheduleGrid";
import { EmptyState } from "../../src/components/EmptyState";
import { useData } from "../../src/context/DataContext";
import { useTheme } from "../../src/context/ThemeContext";
import { styles } from "../../src/theme";

export default function ScheduleScreen() {
  useTheme();
  const { groups, setGroups } = useData();

  if (!groups.length) {
    return (
      <View style={styles.screen}>
        <EmptyState
          icon="calendar-outline"
          title="No schedule table yet"
          message="Add a group column to build your weekly schedule table, or create groups from the Groups screen."
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScheduleGrid groups={groups} onSaved={setGroups} />
    </View>
  );
}
