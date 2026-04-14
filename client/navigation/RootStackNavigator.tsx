import React, { useEffect } from "react";
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
    runStartupBackfill().then(result => {
      if (result.hometownFilled > 0) {
        console.log(`[App] Backfilled ${result.hometownFilled} hometowns on startup`);
      }
    }).catch(err => {
      console.error("[App] Startup backfill error:", err);
    });
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
