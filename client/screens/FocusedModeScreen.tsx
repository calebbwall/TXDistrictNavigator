import React, { useState, useRef, useEffect } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Animated,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { invalidatePrayerQueries } from "@/lib/prayer-utils";
import { useToast } from "@/components/Toast";

type Prayer = {
  id: string;
  title: string;
  body: string;
  status: "OPEN" | "ANSWERED" | "ARCHIVED";
  createdAt: string;
  answeredAt: string | null;
  archivedAt: string | null;
  answerNote: string | null;
  categoryId: string | null;
  officialIds: string[];
  pinnedDaily: boolean;
  priority: number;
  lastPrayedAt: string | null;
};

type PrayerCategory = {
  id: string;
  name: string;
  sortOrder: number;
};

export default function FocusedModeScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const route = useRoute();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { prayerIds, startIndex } = route.params as {
    prayerIds: string[];
    startIndex: number;
  };

  const [currentIndex, setCurrentIndex] = useState(startIndex || 0);
  const [showPrayedSuccess, setShowPrayedSuccess] = useState(false);
  const scaleAnim = useRef(new Animated.Value(0)).current;

  const { data: categories } = useQuery<PrayerCategory[]>({
    queryKey: ["/api/prayer-categories"],
  });

  const prayerQueries = prayerIds.map((id) => ({
    queryKey: ["/api/prayers", id],
  }));

  const { data: currentPrayer, isLoading } = useQuery<Prayer>({
    queryKey: prayerQueries[currentIndex]?.queryKey || ["/api/prayers", ""],
    enabled: currentIndex < prayerIds.length,
  });

  const markPrayedMutation = useMutation({
    mutationFn: async (prayerId: string) => {
      await apiRequest("PATCH", `/api/prayers/${prayerId}`, {
        lastPrayedAt: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast("Marked as prayed");
      setShowPrayedSuccess(true);
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
      }).start();
      setTimeout(() => {
        setShowPrayedSuccess(false);
        scaleAnim.setValue(0);
      }, 2000);
      invalidatePrayerQueries(queryClient);
    },
  });

  const getCategoryName = (categoryId: string | null): string | null => {
    if (!categoryId || !categories) return null;
    const cat = categories.find((c) => c.id === categoryId);
    return cat ? cat.name : null;
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < prayerIds.length - 1) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handleMarkPrayed = () => {
    if (currentPrayer) {
      markPrayedMutation.mutate(currentPrayer.id);
    }
  };

  const handleClose = () => {
    navigation.goBack();
  };

  if (isLoading) {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: theme.backgroundRoot,
            justifyContent: "center",
            alignItems: "center",
            paddingTop: insets.top,
          },
        ]}
      >
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (!currentPrayer) {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: theme.backgroundRoot,
            justifyContent: "center",
            alignItems: "center",
            paddingTop: insets.top,
          },
        ]}
      >
        <ThemedText type="body" style={{ color: theme.secondaryText }}>
          Prayer not found
        </ThemedText>
        <Pressable onPress={handleClose} style={{ marginTop: Spacing.lg }}>
          <ThemedText type="body" style={{ color: theme.primary }}>
            Go Back
          </ThemedText>
        </Pressable>
      </View>
    );
  }

  const categoryName = getCategoryName(currentPrayer.categoryId);
  const officialsCount = currentPrayer.officialIds
    ? currentPrayer.officialIds.length
    : 0;
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === prayerIds.length - 1;

  return (
    <View
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
    >
      <View
        style={[
          styles.topBar,
          { paddingTop: insets.top + Spacing.sm },
        ]}
      >
        <Pressable onPress={handleClose} style={styles.closeButton}>
          <Feather name="x" size={24} color={theme.text} />
        </Pressable>
        <ThemedText type="small" style={{ color: theme.secondaryText }}>
          {currentIndex + 1} of {prayerIds.length}
        </ThemedText>
      </View>

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 140, paddingTop: Spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.prayerContent}>
          {categoryName ? (
            <View
              style={[
                styles.categoryChip,
                { backgroundColor: theme.primary + "18" },
              ]}
            >
              <ThemedText
                type="small"
                style={{ color: theme.primary, fontWeight: "600" }}
              >
                {categoryName}
              </ThemedText>
            </View>
          ) : null}

          <ThemedText
            type="h1"
            style={[styles.title, { textAlign: "center" }]}
          >
            {currentPrayer.title}
          </ThemedText>

          {officialsCount > 0 ? (
            <View
              style={[
                styles.officialsBadge,
                { backgroundColor: theme.backgroundDefault },
              ]}
            >
              <Feather
                name="users"
                size={14}
                color={theme.secondaryText}
              />
              <ThemedText
                type="caption"
                style={{
                  color: theme.secondaryText,
                  marginLeft: Spacing.xs,
                }}
              >
                {officialsCount}{" "}
                {officialsCount === 1 ? "official" : "officials"}
              </ThemedText>
            </View>
          ) : null}

          <ThemedText
            type="body"
            style={[
              styles.bodyText,
              { color: theme.text, lineHeight: 34 },
            ]}
          >
            {currentPrayer.body}
          </ThemedText>
        </View>
      </ScrollView>

      <View
        style={[
          styles.bottomBar,
          {
            paddingBottom: insets.bottom + Spacing.md,
            backgroundColor: theme.backgroundRoot,
            borderTopColor: theme.border,
          },
        ]}
      >
        <Button
          onPress={handleMarkPrayed}
          style={styles.markPrayedButton}
          disabled={markPrayedMutation.isPending || showPrayedSuccess}
        >
          {showPrayedSuccess ? (
            <Animated.View
              style={[
                styles.markPrayedContent,
                {
                  transform: [{ scale: scaleAnim }],
                },
              ]}
            >
              <View
                style={[
                  styles.successIcon,
                  { backgroundColor: theme.primary },
                ]}
              >
                <Feather
                  name="check"
                  size={24}
                  color="#FFFFFF"
                />
              </View>
            </Animated.View>
          ) : (
            <View style={styles.markPrayedContent}>
              <Feather
                name="check"
                size={20}
                color={theme.buttonText}
                style={{ marginRight: Spacing.sm }}
              />
              <ThemedText
                type="body"
                style={{ color: theme.buttonText, fontWeight: "600" }}
              >
                {markPrayedMutation.isPending
                  ? "Marking..."
                  : "Mark Prayed"}
              </ThemedText>
            </View>
          )}
        </Button>

        <View style={styles.navRow}>
          <Pressable
            onPress={handlePrev}
            disabled={isFirst}
            style={[
              styles.navButton,
              {
                backgroundColor: isFirst
                  ? theme.backgroundDefault
                  : theme.backgroundSecondary,
                opacity: isFirst ? 0.5 : 1,
              },
            ]}
          >
            <Feather
              name="chevron-left"
              size={24}
              color={isFirst ? theme.secondaryText : theme.text}
            />
            <ThemedText
              type="caption"
              style={{
                color: isFirst ? theme.secondaryText : theme.text,
                marginLeft: Spacing.xs,
              }}
            >
              Prev
            </ThemedText>
          </Pressable>

          <Pressable
            onPress={handleNext}
            disabled={isLast}
            style={[
              styles.navButton,
              {
                backgroundColor: isLast
                  ? theme.backgroundDefault
                  : theme.backgroundSecondary,
                opacity: isLast ? 0.5 : 1,
              },
            ]}
          >
            <ThemedText
              type="caption"
              style={{
                color: isLast ? theme.secondaryText : theme.text,
                marginRight: Spacing.xs,
              }}
            >
              Next
            </ThemedText>
            <Feather
              name="chevron-right"
              size={24}
              color={isLast ? theme.secondaryText : theme.text}
            />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  prayerContent: {
    alignItems: "center",
  },
  categoryChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.lg,
  },
  title: {
    marginBottom: Spacing.lg,
  },
  officialsBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm + 4,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.xl,
  },
  bodyText: {
    fontSize: 20,
    textAlign: "center",
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
  },
  markPrayedButton: {
    marginBottom: Spacing.md,
  },
  markPrayedContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  successIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
  },
  navRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: Spacing.md,
  },
  navButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
});
