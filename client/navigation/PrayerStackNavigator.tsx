import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import PrayerListScreen from "@/screens/PrayerListScreen";
import AddPrayerScreen from "@/screens/AddPrayerScreen";
import PrayerDetailScreen from "@/screens/PrayerDetailScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type PrayerStackParamList = {
  PrayerList: { status?: string; officialId?: string; officialName?: string } | undefined;
  AddPrayer: { officialId?: string; officialName?: string } | undefined;
  PrayerDetail: { prayerId: string };
};

const Stack = createNativeStackNavigator<PrayerStackParamList>();

export default function PrayerStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="PrayerList"
        component={PrayerListScreen}
        options={{
          headerTitle: "Prayers",
        }}
      />
      <Stack.Screen
        name="AddPrayer"
        component={AddPrayerScreen}
        options={{
          headerTitle: "Add Prayer",
        }}
      />
      <Stack.Screen
        name="PrayerDetail"
        component={PrayerDetailScreen}
        options={{
          headerTitle: "Prayer",
        }}
      />
    </Stack.Navigator>
  );
}
