import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import LegislativeDashboardScreen from "@/screens/LegislativeDashboardScreen";
import HearingDetailScreen from "@/screens/HearingDetailScreen";
import AlertsScreen from "@/screens/AlertsScreen";
import CommitteeDetailScreen from "@/screens/CommitteeDetailScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type LegislativeStackParamList = {
  LegislativeDashboard: undefined;
  HearingDetail: { eventId: string; title: string };
  Alerts: undefined;
  CommitteeDetail: { committeeId: string; committeeName: string };
};

const Stack = createNativeStackNavigator<LegislativeStackParamList>();

export default function LegislativeStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="LegislativeDashboard"
        component={LegislativeDashboardScreen}
        options={{ headerTitle: "Legislative Calendar" }}
      />
      <Stack.Screen
        name="HearingDetail"
        component={HearingDetailScreen}
        options={({ route }) => ({ headerTitle: route.params.title })}
      />
      <Stack.Screen
        name="Alerts"
        component={AlertsScreen}
        options={{ headerTitle: "Alerts" }}
      />
      <Stack.Screen
        name="CommitteeDetail"
        component={CommitteeDetailScreen}
        options={({ route }) => ({ headerTitle: route.params.committeeName })}
      />
    </Stack.Navigator>
  );
}
