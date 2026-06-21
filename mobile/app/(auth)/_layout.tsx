import { Stack } from "expo-router";

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: true, title: "" }}>
      <Stack.Screen name="server-setup" options={{ title: "Server setup" }} />
      <Stack.Screen name="login" options={{ title: "Sign in" }} />
    </Stack>
  );
}
