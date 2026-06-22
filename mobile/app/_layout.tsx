import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { DataProvider } from "../src/context/DataContext";
import { ThemeProvider, useTheme } from "../src/context/ThemeContext";
import { PreferencesProvider } from "../src/context/PreferencesContext";
import { colors } from "../src/theme";

function ThemedShell() {
  const { scheme } = useTheme();
  return (
    <>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
        <PreferencesProvider>
          <DataProvider>
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(drawer)" />
            </Stack>
          </DataProvider>
        </PreferencesProvider>
      </GestureHandlerRootView>
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <ThemedShell />
    </ThemeProvider>
  );
}
