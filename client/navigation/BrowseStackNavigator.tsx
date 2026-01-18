import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import BrowseOfficialsScreen from "@/screens/BrowseOfficialsScreen";
import OfficialProfileScreen from "@/screens/OfficialProfileScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type BrowseStackParamList = {
  Browse: undefined;
  OfficialProfile: { officialId: string };
};

const Stack = createNativeStackNavigator<BrowseStackParamList>();

export default function BrowseStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Browse"
        component={BrowseOfficialsScreen}
        options={{
          headerTitle: "Browse Officials",
        }}
      />
      <Stack.Screen
        name="OfficialProfile"
        component={OfficialProfileScreen}
        options={{
          headerTitle: "Official",
        }}
      />
    </Stack.Navigator>
  );
}
