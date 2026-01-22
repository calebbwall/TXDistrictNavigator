import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import AppIcon from "@/components/AppIcon";
import { BlurView } from "expo-blur";
import { Platform, StyleSheet } from "react-native";
import MapStackNavigator from "@/navigation/MapStackNavigator";
import BrowseStackNavigator from "@/navigation/BrowseStackNavigator";
import ProfileStackNavigator from "@/navigation/ProfileStackNavigator";
import { useTheme } from "@/hooks/useTheme";

export type MainTabParamList = {
  MapTab: undefined;
  BrowseTab: undefined;
  ProfileTab: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

export default function MainTabNavigator() {
  const { theme, isDark } = useTheme();

  return (
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
            <AppIcon name="map" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="BrowseTab"
        component={BrowseStackNavigator}
        options={{
          title: "Browse",
          tabBarIcon: ({ color, size }) => (
            <AppIcon name="list" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileStackNavigator}
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => (
            <AppIcon name="user" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
