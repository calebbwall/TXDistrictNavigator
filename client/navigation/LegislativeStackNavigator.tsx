import React from "react";
import { View, Pressable } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import LegislativeHomeScreen from "@/screens/LegislativeHomeScreen";
import LegislativeDashboardScreen from "@/screens/LegislativeDashboardScreen";
import CommitteeBrowserScreen from "@/screens/CommitteeBrowserScreen";
import CommitteeDetailScreen from "@/screens/CommitteeDetailScreen";
import HearingDetailScreen from "@/screens/HearingDetailScreen";
import AlertsScreen from "@/screens/AlertsScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { useTheme } from "@/hooks/useTheme";
import { getApiUrl } from "@/lib/query-client";

export type LegislativeStackParamList = {
  LegislativeHome: undefined;
  LegislativeDashboard: undefined;
  CommitteeBrowser: undefined;
  CommitteeDetail: { committeeId: string; committeeName: string };
  HearingDetail: { eventId: string; title: string };
  Alerts: undefined;
};

const Stack = createNativeStackNavigator<LegislativeStackParamList>();

// Header bell icon with unread-count dot
function AlertsBell({ onPress }: { onPress: () => void }) {
  const { theme } = useTheme();
  const { data } = useQuery<{ unreadCount: number }>({
    queryKey: ["/api/alerts", { unreadOnly: true }],
    queryFn: async () => {
      const url = new URL("/api/alerts?unreadOnly=true", getApiUrl());
      const res = await fetch(url.toString());
      if (!res.ok) return { alerts: [], unreadCount: 0 };
      return res.json();
    },
    staleTime: 60_000,
    select: (d) => ({ unreadCount: d.unreadCount }),
  });
  const count = data?.unreadCount ?? 0;

  return (
    <Pressable onPress={onPress} style={{ padding: 6, marginRight: 2 }}>
      <View>
        <Feather name="bell" size={22} color={theme.text} />
        {count > 0 ? (
          <View
            style={{
              position: "absolute",
              top: -2,
              right: -2,
              width: 9,
              height: 9,
              borderRadius: 5,
              backgroundColor: theme.warning,
              borderWidth: 1.5,
              borderColor: theme.backgroundRoot,
            }}
          />
        ) : null}
      </View>
    </Pressable>
  );
}

export default function LegislativeStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="LegislativeHome"
        component={LegislativeHomeScreen}
        options={({ navigation }) => ({
          headerTitle: "Legislative",
          headerRight: () => (
            <AlertsBell onPress={() => navigation.navigate("Alerts")} />
          ),
        })}
      />
      <Stack.Screen
        name="LegislativeDashboard"
        component={LegislativeDashboardScreen}
        options={{ headerTitle: "Legislative Calendar" }}
      />
      <Stack.Screen
        name="CommitteeBrowser"
        component={CommitteeBrowserScreen}
        options={{ headerTitle: "Committees" }}
      />
      <Stack.Screen
        name="CommitteeDetail"
        component={CommitteeDetailScreen}
        options={({ route }) => ({ headerTitle: route.params.committeeName })}
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
    </Stack.Navigator>
  );
}
