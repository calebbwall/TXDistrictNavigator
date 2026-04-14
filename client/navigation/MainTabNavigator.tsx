import React from "react";
import { View, Pressable, StyleSheet, Platform } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Feather, Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import MapStackNavigator from "@/navigation/MapStackNavigator";
import BrowseStackNavigator from "@/navigation/BrowseStackNavigator";
import PrayerStackNavigator from "@/navigation/PrayerStackNavigator";
import ProfileStackNavigator from "@/navigation/ProfileStackNavigator";
import LegislativeStackNavigator from "@/navigation/LegislativeStackNavigator";
import { useTheme } from "@/hooks/useTheme";
import { Spacing } from "@/constants/theme";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

import type { FocusDistrictParams } from "@/navigation/MapStackNavigator";
import type { NavigatorScreenParams } from "@react-navigation/native";

export type MainTabParamList = {
  MapTab: NavigatorScreenParams<{ Map: { focusDistrict?: FocusDistrictParams } | undefined }> | undefined;
  BrowseTab: undefined;
  PrayerTab: undefined;
  ProfileTab: undefined;
  LegislativeTab: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

function AskAIFab() {
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <Pressable
      onPress={() => navigation.navigate("AskAI")}
      style={({ pressed }) => [
        styles.fab,
        {
          backgroundColor: theme.primary,
          opacity: pressed ? 0.85 : 1,
          shadowColor: theme.primary,
        },
      ]}
    >
      <Ionicons name="sparkles" size={24} color="#FFFFFF" />
    </Pressable>
  );
}

export default function MainTabNavigator() {
  const { theme, isDark } = useTheme();

  return (
    <View style={{ flex: 1 }}>
      <Tab.Navigator
        initialRouteName="MapTab"
        screenOptions={{
          tabBarActiveTintColor: theme.tabIconSelected,
          tabBarInactiveTintColor: theme.tabIconDefault,
          tabBarStyle: {
            position: "absolute",
            backgroundColor: Platform.select({
              ios: "transparent",
              android: theme.backgroundRoot,
            }),
            borderTopWidth: 0,
            elevation: 0,
          },
          tabBarBackground: () =>
            Platform.OS === "ios" ? (
              <BlurView
                intensity={100}
                tint={isDark ? "dark" : "light"}
                style={StyleSheet.absoluteFill}
              />
            ) : null,
          headerShown: false,
        }}
      >
        <Tab.Screen
          name="MapTab"
          component={MapStackNavigator}
          options={{
            title: "Map",
            tabBarIcon: ({ color, size }) => (
              <Feather name="map" size={size} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="BrowseTab"
          component={BrowseStackNavigator}
          options={{
            title: "Browse",
            tabBarIcon: ({ color, size }) => (
              <Feather name="list" size={size} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="PrayerTab"
          component={PrayerStackNavigator}
          options={{
            title: "Prayers",
            tabBarIcon: ({ color, size }) => (
              <Feather name="heart" size={size} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="LegislativeTab"
          component={LegislativeStackNavigator}
          options={{
            title: "Legislative",
            tabBarIcon: ({ color, size }) => (
              <Feather name="calendar" size={size} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="ProfileTab"
          component={ProfileStackNavigator}
          options={{
            title: "Profile",
            tabBarIcon: ({ color, size }) => (
              <Feather name="user" size={size} color={color} />
            ),
          }}
        />
      </Tab.Navigator>
      <AskAIFab />
    </View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    right: Spacing.lg,
    bottom: 90,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
});
