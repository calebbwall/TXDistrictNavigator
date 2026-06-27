import React, { useEffect } from "react";
import { InteractionManager } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import MainTabNavigator from "@/navigation/MainTabNavigator";
import AskAIScreen from "@/screens/AskAIScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { ToastProvider } from "@/components/Toast";
import { runStartupBackfill } from "@/lib/hometownBackfill";

export type RootStackParamList = {
  Main: undefined;
  AskAI: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootStackNavigator() {
  const screenOptions = useScreenOptions();

  useEffect(() => {
    // Defer the hometown backfill until after the UI has settled. It fetches
    // the full officials roster, which previously competed with the Map and
    // Browse loads at launch and slowed first paint. Running it after
    // interactions (plus a short delay) keeps startup focused on visible
    // content; it is still gated to run at most once per 24h internally.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const task = InteractionManager.runAfterInteractions(() => {
      timer = setTimeout(() => {
        runStartupBackfill()
          .then((result) => {
            if (result.hometownFilled > 0) {
              console.log(
                `[App] Backfilled ${result.hometownFilled} hometowns on startup`,
              );
            }
          })
          .catch((err) => {
            console.error("[App] Startup backfill error:", err);
          });
      }, 4000);
    });
    return () => {
      task.cancel();
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <ToastProvider>
      <Stack.Navigator screenOptions={screenOptions}>
        <Stack.Screen
          name="Main"
          component={MainTabNavigator}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="AskAI"
          component={AskAIScreen}
          options={{
            headerTitle: "Ask AI",
            presentation: "modal",
            headerTransparent: false,
          }}
        />
      </Stack.Navigator>
    </ToastProvider>
  );
}
