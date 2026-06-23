import { Stack } from "expo-router";
import { colors } from "../../src/theme";

export default function EditLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        presentation: "fullScreenModal",
        animation: "fade",
        contentStyle: { backgroundColor: colors.bg },
      }}
    />
  );
}
