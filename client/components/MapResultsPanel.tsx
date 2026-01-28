import React, { useCallback } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  FlatList,
  Dimensions,
  ListRenderItem,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { PartyBadge } from "@/components/PartyBadge";
import { useTheme } from "@/hooks/useTheme";
import { useDebugFlags } from "@/hooks/useDebugFlags";
import { BorderRadius, Spacing, Shadows } from "@/constants/theme";
import type { Official, DistrictHit } from "@/lib/officials";
import { getOfficeTypeLabel } from "@/lib/officials";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const COLLAPSED_HEIGHT = 180;
const EXPANDED_HEIGHT = SCREEN_HEIGHT * 0.55;
const ANIMATION_DURATION = 250;

const LAYER_COLORS: Record<string, { fill: string; stroke: string }> = {
  tx_senate: { fill: "rgba(74, 144, 226, 0.3)", stroke: "#4A90E2" },
  tx_house: { fill: "rgba(233, 75, 60, 0.3)", stroke: "#E94B3C" },
  us_congress: { fill: "rgba(80, 200, 120, 0.3)", stroke: "#50C878" },
};

interface MapResultsPanelProps {
  officials: Official[];
  hits: DistrictHit[];
  onClose: () => void;
  onOfficialPress: (official: Official) => void;
  onClearDrawing?: () => void;
}

interface OfficialCardItemProps {
  official: Official;
  onPress: (official: Official) => void;
  isFirst: boolean;
}

function OfficialCardItem({ official, onPress, isFirst }: OfficialCardItemProps) {
  const { theme } = useTheme();
  const layerType = official.officeType === "us_house" ? "us_congress" : official.officeType;
  const badgeColor = LAYER_COLORS[layerType]?.stroke || "#666";

  return (
    <Pressable
      onPress={() => onPress(official)}
      style={({ pressed }) => [
        styles.officialCard,
        {
          backgroundColor: theme.cardBackground,
          borderColor: theme.border,
        },
        !isFirst && { marginTop: Spacing.sm },
        pressed && { opacity: 0.7, backgroundColor: theme.border },
      ]}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.districtBadge, { backgroundColor: badgeColor }]}>
          <ThemedText type="small" style={{ color: "#FFFFFF", fontWeight: "600" }}>
            {getOfficeTypeLabel(official.officeType, official.roleTitle)}
          </ThemedText>
        </View>
        <View style={styles.districtRow}>
          <ThemedText type="h3" style={{ color: theme.text }}>
            District {official.districtNumber}
          </ThemedText>
          <Feather name="chevron-right" size={18} color={theme.secondaryText} />
        </View>
      </View>
      <View style={styles.nameRow}>
        <ThemedText
          type="body"
          style={{
            color: theme.text,
            fontWeight: "600",
            fontStyle: official.isVacant ? "italic" : "normal",
            flex: 1,
          }}
        >
          {official.fullName}
        </ThemedText>
        {!official.isVacant && official.party ? <PartyBadge party={official.party} size="small" /> : null}
      </View>
      {official.capitolPhone ? (
        <ThemedText type="small" style={{ color: theme.secondaryText, marginTop: 2 }}>
          {official.capitolPhone}
        </ThemedText>
      ) : null}
    </Pressable>
  );
}

export function MapResultsPanel({
  officials,
  hits,
  onClose,
  onOfficialPress,
  onClearDrawing,
}: MapResultsPanelProps) {
  const { theme } = useTheme();
  const { debugEnabled } = useDebugFlags();
  const insets = useSafeAreaInsets();
  const isExpanded = useSharedValue(officials.length > 2);
  const panelHeight = useSharedValue(officials.length > 2 ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT);

  const toggleExpand = useCallback(() => {
    const newExpanded = !isExpanded.value;
    isExpanded.value = newExpanded;
    panelHeight.value = withTiming(newExpanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT, {
      duration: ANIMATION_DURATION,
      easing: Easing.out(Easing.cubic),
    });
  }, [isExpanded, panelHeight]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: panelHeight.value,
  }));

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: isExpanded.value ? "180deg" : "0deg" }],
  }));

  const renderItem: ListRenderItem<Official> = useCallback(
    ({ item, index }) => (
      <OfficialCardItem
        official={item}
        onPress={onOfficialPress}
        isFirst={index === 0}
      />
    ),
    [onOfficialPress]
  );

  const keyExtractor = useCallback((item: Official) => item.id, []);

  const ListHeader = useCallback(
    () => (
      <View style={styles.listHeader}>
        {debugEnabled ? (
          <View style={styles.debugRow}>
            <ThemedText type="small" style={{ color: "#0f0", fontFamily: "monospace", fontSize: 10 }}>
              Hits: {hits.length} | Officials: {officials.length}
            </ThemedText>
          </View>
        ) : null}
      </View>
    ),
    [debugEnabled, hits.length, officials.length]
  );

  const ListEmpty = useCallback(
    () => (
      <View style={styles.emptyState}>
        <Feather name="info" size={24} color={theme.secondaryText} />
        <ThemedText type="body" style={{ color: theme.secondaryText, marginTop: Spacing.sm, textAlign: "center" }}>
          No officials found in this area
        </ThemedText>
      </View>
    ),
    [theme]
  );

  return (
    <Animated.View
      style={[
        styles.container,
        {
          bottom: insets.bottom + Spacing.md,
          backgroundColor: theme.backgroundDefault,
        },
        Shadows.lg,
        animatedStyle,
      ]}
    >
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <View style={styles.headerLeft}>
          <ThemedText type="h3" style={{ color: theme.text }}>
            {officials.length} {officials.length === 1 ? "Official" : "Officials"}
          </ThemedText>
          {hits.length > officials.length ? (
            <ThemedText type="small" style={{ color: theme.secondaryText, marginLeft: Spacing.xs }}>
              ({hits.length} districts)
            </ThemedText>
          ) : null}
        </View>
        <View style={styles.headerButtons}>
          {onClearDrawing ? (
            <Pressable
              onPress={onClearDrawing}
              style={[styles.headerButton, { backgroundColor: theme.cardBackground }]}
            >
              <Feather name="trash-2" size={16} color={theme.secondaryText} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={toggleExpand}
            style={[styles.headerButton, { backgroundColor: theme.cardBackground }]}
          >
            <Animated.View style={chevronStyle}>
              <Feather name="chevron-up" size={20} color={theme.text} />
            </Animated.View>
          </Pressable>
          <Pressable
            onPress={onClose}
            style={[styles.headerButton, { backgroundColor: theme.cardBackground }]}
          >
            <Feather name="x" size={20} color={theme.secondaryText} />
          </Pressable>
        </View>
      </View>

      <FlatList
        data={officials}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={debugEnabled ? ListHeader : null}
        ListEmptyComponent={ListEmpty}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="handled"
        bounces={true}
        scrollEnabled={true}
        nestedScrollEnabled={true}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: Spacing.md,
    right: Spacing.md,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    zIndex: 2000,
    elevation: 200,
    pointerEvents: "auto",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  headerButton: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingBottom: Spacing.lg,
  },
  listHeader: {
    marginBottom: Spacing.xs,
  },
  debugRow: {
    backgroundColor: "rgba(0,0,0,0.7)",
    padding: 4,
    borderRadius: 4,
    marginBottom: Spacing.xs,
  },
  officialCard: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  cardHeader: {
    marginBottom: Spacing.xs,
  },
  districtBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
    marginBottom: 4,
  },
  districtRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.xl,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: Spacing.xs,
  },
});
