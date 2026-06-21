import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Stack } from "expo-router";
import { DataProvider } from "../src/context/DataContext";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <DataProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(drawer)" />
        </Stack>
      </DataProvider>
    </GestureHandlerRootView>
  );
}
