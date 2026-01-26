import React from "react";
import { StyleSheet, View, ActivityIndicator, Platform } from "react-native";
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
