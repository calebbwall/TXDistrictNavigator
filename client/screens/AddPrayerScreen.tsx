import React, { useState } from "react";
import {
  StyleSheet,
  View,
  TextInput,
  Alert,
  Pressable,
  Switch,
} from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";

export default function AddPrayerScreen() {
  const { theme } = useTheme();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation();
  const route = useRoute();
  const queryClient = useQueryClient();

  const params = route.params as { officialId?: string; officialName?: string } | undefined;

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinnedDaily, setPinnedDaily] = useState(false);
  const [priority, setPriority] = useState(0);

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload: any = { title: title.trim(), body: body.trim(), pinnedDaily, priority };
      if (params?.officialId) payload.officialIds = [params.officialId];
      await apiRequest("POST", "/api/prayers", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prayers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/daily-prayer-picks"] });
      navigation.goBack();
    },
    onError: (err: Error) => {
      Alert.alert("Error", err.message);
    },
  });

  const canSave = title.trim().length > 0 && body.trim().length > 0;

  return (
    <KeyboardAwareScrollViewCompat
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={{ paddingTop: headerHeight + Spacing.md, paddingHorizontal: Spacing.md, paddingBottom: Spacing.xxl }}
    >
      {params?.officialName ? (
        <View style={[styles.officialBadge, { backgroundColor: theme.primary + "15" }]}>
          <Feather name="user" size={14} color={theme.primary} />
          <ThemedText type="caption" style={{ color: theme.primary, marginLeft: Spacing.xs }}>
            For {params.officialName}
          </ThemedText>
        </View>
      ) : null}

      <ThemedText type="caption" style={[styles.label, { color: theme.secondaryText }]}>Title</ThemedText>
      <TextInput
        style={[styles.input, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
        placeholder="Prayer title..."
        placeholderTextColor={theme.secondaryText}
        value={title}
        onChangeText={setTitle}
        maxLength={500}
      />

      <ThemedText type="caption" style={[styles.label, { color: theme.secondaryText }]}>Prayer</ThemedText>
      <TextInput
        style={[styles.input, styles.textArea, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
        placeholder="Write your prayer..."
        placeholderTextColor={theme.secondaryText}
        value={body}
        onChangeText={setBody}
        multiline
        textAlignVertical="top"
      />

      <View style={styles.optionRow}>
        <View style={{ flex: 1 }}>
          <ThemedText type="body">Pin to Daily Picks</ThemedText>
          <ThemedText type="caption" style={{ color: theme.secondaryText }}>Always include in today's prayers</ThemedText>
        </View>
        <Switch value={pinnedDaily} onValueChange={setPinnedDaily} />
      </View>

      <View style={styles.optionRow}>
        <View style={{ flex: 1 }}>
          <ThemedText type="body">High Priority</ThemedText>
          <ThemedText type="caption" style={{ color: theme.secondaryText }}>Weighted higher in rotation</ThemedText>
        </View>
        <Switch value={priority === 1} onValueChange={(v) => setPriority(v ? 1 : 0)} />
      </View>

      <Button
        onPress={() => createMutation.mutate()}
        disabled={!canSave || createMutation.isPending}
        style={{ marginTop: Spacing.lg }}
      >
        {createMutation.isPending ? "Saving..." : "Add Prayer"}
      </Button>
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  label: { marginTop: Spacing.md, marginBottom: Spacing.xs, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    fontSize: 15,
  },
  textArea: { minHeight: 120 },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.md,
  },
  officialBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.sm,
  },
});
