import { InteractionManager } from "react-native";
import { DrawerActions } from "@react-navigation/native";
import { router } from "expo-router";

type Nav = { dispatch: (action: ReturnType<typeof DrawerActions.closeDrawer>) => void };

export function openEditScreen(
  navigation: Nav,
  path: "/edit/group" | "/edit/contact" | "/edit/template",
  params?: Record<string, string>
) {
  navigation.dispatch(DrawerActions.closeDrawer());
  InteractionManager.runAfterInteractions(() => {
    setTimeout(() => {
      router.push({ pathname: path, params: params ?? {} });
    }, 50);
  });
}
