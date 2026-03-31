import React, { useEffect } from "react";
import { StyleSheet, View, ActivityIndicator, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { NavigationContainer } from "@react-navigation/native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import {
  Feather,
  Ionicons,
  MaterialIcons,
  MaterialCommunityIcons,
  FontAwesome,
  FontAwesome5,
  Entypo,
  AntDesign,
  Octicons,
  SimpleLineIcons,
  Foundation,
  EvilIcons,
} from "@expo/vector-icons";

import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";

import RootStackNavigator from "@/navigation/RootStackNavigator";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import {
  configureForegroundNotifications,
  registerAndSyncPushToken,
} from "@/lib/notifications";

configureForegroundNotifications();

export default function App() {
  const [fontsLoaded] = useFonts({
    ...Feather.font,
    ...Ionicons.font,
    ...MaterialIcons.font,
    ...MaterialCommunityIcons.font,
    ...FontAwesome.font,
    ...FontAwesome5.font,
    ...Entypo.font,
    ...AntDesign.font,
    ...Octicons.font,
    ...SimpleLineIcons.font,
    ...Foundation.font,
    ...EvilIcons.font,
  });

  useEffect(() => {
    if (fontsLoaded) {
      registerAndSyncPushToken();
    }
  }, [fontsLoaded]);

  // Invalidate React Query caches when a server-driven push notification
  // signals that data has changed.  This ensures screens that are currently
  // mounted reflect the update without the user needing to pull-to-refresh.
  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener(
      (notification) => {
        const data = notification.request.content.data as Record<string, unknown> | null;
        if (!data) return;

        if (data.alertType === "COMMITTEE_MEMBER_CHANGE") {
          // Bust the committee list, all per-committee detail queries, and
          // the per-official committee assignment caches.
          queryClient.invalidateQueries({ queryKey: ["/api/committees"] });
          queryClient.invalidateQueries({
            predicate: (query) => {
              const key = query.queryKey;
              return (
                Array.isArray(key) &&
                key.length === 3 &&
                key[0] === "/api/officials" &&
                key[2] === "committees"
              );
            },
          });
        }
      },
    );
    return () => subscription.remove();
  }, []);

  if (!fontsLoaded) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <GestureHandlerRootView style={styles.root}>
            <KeyboardProvider>
              <NavigationContainer>
                <RootStackNavigator />
              </NavigationContainer>
              <StatusBar style="auto" translucent={Platform.OS !== "android"} />
            </KeyboardProvider>
          </GestureHandlerRootView>
        </SafeAreaProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
});
