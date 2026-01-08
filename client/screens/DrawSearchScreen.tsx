import React, { useState, useCallback } from "react";
import { StyleSheet, View, Image, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation } from "@react-navigation/native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  FadeIn,
} from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { OfficialCard } from "@/components/OfficialCard";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Spacing, Shadows } from "@/constants/theme";
import { mockOfficials, type Official } from "@/lib/mockData";

export default function DrawSearchScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation();
  const { theme } = useTheme();

  const [hasDrawn, setHasDrawn] = useState(false);
  const [searchResults, setSearchResults] = useState<Official[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);

  const handleStartDraw = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsDrawing(true);
    setTimeout(() => {
      setIsDrawing(false);
      setHasDrawn(true);
      const results = mockOfficials.slice(0, 4);
      setSearchResults(results);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }, 1500);
  }, []);

  const handleClearDraw = useCallback(() => {
    setHasDrawn(false);
    setSearchResults([]);
  }, []);

  const handleOfficialPress = useCallback(
    (official: Official) => {
      navigation.goBack();
    },
    [navigation]
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <View
        style={[
          styles.content,
          {
            paddingTop: headerHeight + Spacing.lg,
            paddingBottom: insets.bottom + Spacing.xl,
          },
        ]}
      >
        <View style={styles.instructionsCard}>
          <Image
            source={require("../../assets/images/empty-search.png")}
            style={styles.tutorialImage}
            resizeMode="contain"
          />
          <ThemedText type="h3" style={styles.instructionsTitle}>
            Draw to Search
          </ThemedText>
          <ThemedText
            type="body"
            style={{ color: theme.secondaryText, textAlign: "center" }}
          >
            Draw a shape on the map to find all districts and officials within that area.
          </ThemedText>
        </View>

        <View
          style={[
            styles.mapPlaceholder,
            { backgroundColor: theme.backgroundDefault },
          ]}
        >
          {isDrawing ? (
            <Animated.View entering={FadeIn.duration(300)} style={styles.drawingState}>
              <Feather name="edit-2" size={32} color={theme.primary} />
              <ThemedText type="body" style={{ marginTop: Spacing.sm }}>
                Drawing area...
              </ThemedText>
            </Animated.View>
          ) : hasDrawn ? (
            <Animated.View entering={FadeIn.duration(300)} style={styles.drawnState}>
              <View
                style={[
                  styles.drawnArea,
                  { borderColor: theme.primary, backgroundColor: `${theme.primary}22` },
                ]}
              />
              <ThemedText type="caption" style={{ color: theme.secondaryText }}>
                Area selected
              </ThemedText>
            </Animated.View>
          ) : (
            <View style={styles.emptyMapState}>
              <Feather name="map" size={32} color={theme.secondaryText} />
              <ThemedText
                type="caption"
                style={{ color: theme.secondaryText, marginTop: Spacing.sm }}
              >
                Tap "Start Drawing" to begin
              </ThemedText>
            </View>
          )}
        </View>

        <View style={styles.actions}>
          {hasDrawn ? (
            <>
              <Button onPress={handleClearDraw} style={styles.actionButton}>
                Clear and Redraw
              </Button>
            </>
          ) : (
            <Button
              onPress={handleStartDraw}
              disabled={isDrawing}
              style={styles.actionButton}
            >
              {isDrawing ? "Drawing..." : "Start Drawing"}
            </Button>
          )}
        </View>

        {hasDrawn && searchResults.length > 0 ? (
          <Animated.View entering={FadeIn.duration(300)} style={styles.results}>
            <ThemedText type="h3" style={styles.resultsTitle}>
              Officials Found
            </ThemedText>
            <ThemedText
              type="caption"
              style={{ color: theme.secondaryText, marginBottom: Spacing.md }}
            >
              {searchResults.length} official{searchResults.length !== 1 ? "s" : ""} in selected area
            </ThemedText>
            {searchResults.map((official) => (
              <View key={official.id} style={styles.resultItem}>
                <OfficialCard
                  official={official}
                  onPress={() => handleOfficialPress(official)}
                />
              </View>
            ))}
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  instructionsCard: {
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  tutorialImage: {
    width: 100,
    height: 100,
    marginBottom: Spacing.md,
    opacity: 0.8,
  },
  instructionsTitle: {
    marginBottom: Spacing.sm,
    textAlign: "center",
  },
  mapPlaceholder: {
    height: 200,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  emptyMapState: {
    alignItems: "center",
    justifyContent: "center",
  },
  drawingState: {
    alignItems: "center",
    justifyContent: "center",
  },
  drawnState: {
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: "100%",
  },
  drawnArea: {
    width: 120,
    height: 80,
    borderWidth: 3,
    borderStyle: "dashed",
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.sm,
  },
  actions: {
    marginBottom: Spacing.lg,
  },
  actionButton: {
    marginBottom: Spacing.sm,
  },
  results: {
    flex: 1,
  },
  resultsTitle: {
    marginBottom: Spacing.xs,
  },
  resultItem: {
    marginBottom: Spacing.sm,
  },
});
