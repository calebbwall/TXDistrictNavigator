import React from "react";
import { Pressable } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { HeaderButton } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import PrayerDashboardScreen from "@/screens/PrayerDashboardScreen";
import PrayerListScreen from "@/screens/PrayerListScreen";
import AddPrayerScreen from "@/screens/AddPrayerScreen";
import PrayerDetailScreen from "@/screens/PrayerDetailScreen";
import FocusedModeScreen from "@/screens/FocusedModeScreen";
import ManageCategoriesScreen from "@/screens/ManageCategoriesScreen";
import PrayerSettingsScreen from "@/screens/PrayerSettingsScreen";
import PrayerDiagnosticsScreen from "@/screens/PrayerDiagnosticsScreen";
import UpcomingEventsScreen from "@/screens/UpcomingEventsScreen";
import { ThemedText } from "@/components/ThemedText";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { useTheme } from "@/hooks/useTheme";

export type PrayerStackParamList = {
  PrayerDashboard: undefined;
  PrayerList: {
    status?: string;
    officialId?: string;
    officialName?: string;
    categoryId?: string;
    categoryName?: string;
  } | undefined;
  AllPrayers: { categoryId?: string } | undefined;
  AddPrayer: {
    officialId?: string;
    officialName?: string;
    categoryId?: string;
    categoryName?: string;
  } | undefined;
  PrayerDetail: { prayerId: string };
  FocusedMode: { prayerIds: string[]; startIndex: number };
  UpcomingEvents: undefined;
  ManageCategories: undefined;
  PrayerSettings: undefined;
  PrayerDiagnostics: undefined;
};

const Stack = createNativeStackNavigator<PrayerStackParamList>();

export default function PrayerStackNavigator() {
  const screenOptions = useScreenOptions();
  const { theme } = useTheme();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="PrayerDashboard"
        component={PrayerDashboardScreen}
        options={({ navigation }) => ({
          headerTitle: () => (
            <Pressable
              onLongPress={() => navigation.navigate("PrayerDiagnostics")}
              delayLongPress={800}
            >
              <ThemedText type="h3">Prayers</ThemedText>
            </Pressable>
          ),
          headerRight: () => (
            <HeaderButton
              onPress={() => navigation.navigate("PrayerSettings")}
            >
              <Feather name="settings" size={20} color={theme.text} />
            </HeaderButton>
          ),
        })}
      />
      <Stack.Screen
        name="PrayerList"
        component={PrayerListScreen}
        options={{
          headerTitle: "Prayers",
        }}
      />
      <Stack.Screen
        name="AllPrayers"
        component={PrayerListScreen}
        options={{
          headerTitle: "All Prayers",
        }}
      />
      <Stack.Screen
        name="AddPrayer"
        component={AddPrayerScreen}
        options={({ navigation }) => ({
          headerTitle: "Add Prayer",
          headerLeft: () => (
            <HeaderButton
              onPress={() => {
                const state = navigation.getState();
                const hasStackHistory = state && state.routes && state.routes.length > 1;
                if (hasStackHistory) {
                  navigation.goBack();
                } else {
                  navigation.reset({
                    index: 0,
                    routes: [{ name: "PrayerDashboard" }],
                  });
                }
              }}
            >
              <Feather name="arrow-left" size={22} color={theme.text} />
            </HeaderButton>
          ),
        })}
      />
      <Stack.Screen
        name="PrayerDetail"
        component={PrayerDetailScreen}
        options={{
          headerTitle: "Prayer",
        }}
      />
      <Stack.Screen
        name="FocusedMode"
        component={FocusedModeScreen}
        options={{
          headerShown: false,
          presentation: "fullScreenModal",
        }}
      />
      <Stack.Screen
        name="UpcomingEvents"
        component={UpcomingEventsScreen}
        options={{
          headerTitle: "Upcoming Events",
        }}
      />
      <Stack.Screen
        name="ManageCategories"
        component={ManageCategoriesScreen}
        options={{
          headerTitle: "Categories",
        }}
      />
      <Stack.Screen
        name="PrayerSettings"
        component={PrayerSettingsScreen}
        options={{
          headerTitle: "Prayer Settings",
        }}
      />
      <Stack.Screen
        name="PrayerDiagnostics"
        component={PrayerDiagnosticsScreen}
        options={{
          headerTitle: "Diagnostics",
        }}
      />
    </Stack.Navigator>
  );
}
