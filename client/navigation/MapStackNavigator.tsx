import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import MapScreen from "@/screens/MapScreen";
import OfficialProfileScreen from "@/screens/OfficialProfileScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { HeaderTitle } from "@/components/HeaderTitle";

export type MapStackParamList = {
  Map: undefined;
  OfficialProfile: { officialId: string };
};

const Stack = createNativeStackNavigator<MapStackParamList>();

export default function MapStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Map"
        component={MapScreen}
        options={{
          headerTitle: () => <HeaderTitle title="Texas Districts" />,
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
