import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import ProfileScreen from "@/screens/ProfileScreen";
import OfficialProfileScreen from "@/screens/OfficialProfileScreen";
import AboutScreen from "@/screens/AboutScreen";
import FollowUpDashboardScreen from "@/screens/FollowUpDashboardScreen";
import SavedOfficialsScreen from "@/screens/SavedOfficialsScreen";
import CommitteesScreen from "@/screens/CommitteesScreen";
import CommitteeListScreen from "@/screens/CommitteeListScreen";
import CommitteeDetailScreen from "@/screens/CommitteeDetailScreen";
import OtherTexasOfficialsScreen from "@/screens/OtherTexasOfficialsScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type ProfileStackParamList = {
  Profile: undefined;
  OfficialProfile: { officialId: string; initialSection?: "privateNotes" };
  About: undefined;
  FollowUpDashboard: undefined;
  SavedOfficials: undefined;
  Committees: undefined;
  CommitteeList: { chamber: "TX_HOUSE" | "TX_SENATE" };
  CommitteeDetail: { committeeId: string; committeeName: string };
  OtherTexasOfficials: undefined;
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
      <Stack.Screen
        name="Committees"
        component={CommitteesScreen}
        options={{
          headerTitle: "Committees",
        }}
      />
      <Stack.Screen
        name="CommitteeList"
        component={CommitteeListScreen}
        options={({ route }) => ({
          headerTitle: route.params.chamber === "TX_HOUSE" ? "House Committees" : "Senate Committees",
        })}
      />
      <Stack.Screen
        name="CommitteeDetail"
        component={CommitteeDetailScreen}
        options={({ route }) => ({
          headerTitle: route.params.committeeName,
        })}
      />
      <Stack.Screen
        name="OtherTexasOfficials"
        component={OtherTexasOfficialsScreen}
        options={{
          headerTitle: "Other Texas Officials",
        }}
      />
    </Stack.Navigator>
  );
}
