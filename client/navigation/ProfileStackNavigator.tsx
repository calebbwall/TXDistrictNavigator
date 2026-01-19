import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import ProfileScreen from "@/screens/ProfileScreen";
import OfficialProfileScreen from "@/screens/OfficialProfileScreen";
import AboutScreen from "@/screens/AboutScreen";
import FollowUpDashboardScreen from "@/screens/FollowUpDashboardScreen";
import SavedOfficialsScreen from "@/screens/SavedOfficialsScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type ProfileStackParamList = {
  Profile: undefined;
  OfficialProfile: { officialId: string; initialSection?: "privateNotes" };
  About: undefined;
  FollowUpDashboard: undefined;
  SavedOfficials: undefined;
};

const Stack = createNativeStackNavigator<ProfileStackParamList>();

export default function ProfileStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          headerTitle: "Profile",
        }}
      />
      <Stack.Screen
        name="OfficialProfile"
        component={OfficialProfileScreen}
        options={{
          headerTitle: "Official",
        }}
      />
      <Stack.Screen
        name="About"
        component={AboutScreen}
        options={{
          headerTitle: "About",
        }}
      />
      <Stack.Screen
        name="FollowUpDashboard"
        component={FollowUpDashboardScreen}
        options={{
          headerTitle: "Follow-Up Items",
        }}
      />
      <Stack.Screen
        name="SavedOfficials"
        component={SavedOfficialsScreen}
        options={{
          headerTitle: "Saved Officials",
        }}
      />
    </Stack.Navigator>
  );
}
