import React from "react";
import { StyleSheet, View, Pressable, Dimensions } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  WithSpringConfig,
} from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Spacing } from "@/constants/theme";
import type { DistrictType } from "@/lib/mockData";

interface TexasMapPlaceholderProps {
  overlays: {
    senate: boolean;
    house: boolean;
    congress: boolean;
  };
  selectedDistrict: { type: DistrictType; number: number } | null;
  onDistrictSelect: (type: DistrictType, number: number) => void;
}

const springConfig: WithSpringConfig = {
  damping: 15,
  mass: 0.5,
  stiffness: 150,
};

interface DistrictButtonProps {
  type: DistrictType;
  number: number;
  x: number;
  y: number;
  isSelected: boolean;
  isVisible: boolean;
  onPress: () => void;
  color: string;
}

function DistrictButton({
  type,
  number,
  x,
  y,
  isSelected,
  isVisible,
  onPress,
  color,
}: DistrictButtonProps) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(isVisible ? 1 : 0);

  React.useEffect(() => {
    opacity.value = withSpring(isVisible ? 1 : 0, springConfig);
  }, [isVisible, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.9, springConfig);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, springConfig);
  };

  if (!isVisible) return null;

  return (
    <Animated.View
      style={[
        styles.districtButton,
        {
          left: x,
          top: y,
          backgroundColor: isSelected ? color : `${color}66`,
          borderColor: color,
          borderWidth: isSelected ? 3 : 1,
        },
        animatedStyle,
      ]}
    >
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.districtButtonInner}
      >
        <ThemedText
          type="small"
          style={{ color: "#FFFFFF", fontWeight: "700" }}
        >
          {number}
        </ThemedText>
      </Pressable>
    </Animated.View>
  );
}

export function TexasMapPlaceholder({
  overlays,
  selectedDistrict,
  onDistrictSelect,
}: TexasMapPlaceholderProps) {
  const { theme } = useTheme();
  const { width } = Dimensions.get("window");
  const mapHeight = width * 0.8;

  const senatePositions = [
    { number: 1, x: 0.7, y: 0.15 },
    { number: 2, x: 0.55, y: 0.2 },
    { number: 3, x: 0.65, y: 0.25 },
    { number: 4, x: 0.75, y: 0.35 },
    { number: 5, x: 0.5, y: 0.4 },
    { number: 6, x: 0.8, y: 0.5 },
    { number: 7, x: 0.7, y: 0.55 },
    { number: 8, x: 0.6, y: 0.3 },
  ];

  const housePositions = [
    { number: 1, x: 0.75, y: 0.1 },
    { number: 2, x: 0.65, y: 0.15 },
    { number: 3, x: 0.7, y: 0.3 },
    { number: 4, x: 0.6, y: 0.35 },
    { number: 5, x: 0.8, y: 0.25 },
    { number: 6, x: 0.75, y: 0.45 },
    { number: 7, x: 0.85, y: 0.4 },
    { number: 8, x: 0.55, y: 0.5 },
  ];

  const congressPositions = [
    { number: 1, x: 0.72, y: 0.18 },
    { number: 2, x: 0.82, y: 0.48 },
    { number: 3, x: 0.58, y: 0.28 },
    { number: 4, x: 0.68, y: 0.12 },
    { number: 5, x: 0.55, y: 0.38 },
    { number: 6, x: 0.48, y: 0.48 },
    { number: 7, x: 0.78, y: 0.58 },
    { number: 8, x: 0.72, y: 0.42 },
  ];

  return (
    <View
      style={[
        styles.container,
        {
          height: mapHeight,
          backgroundColor: theme.backgroundDefault,
        },
      ]}
    >
      <View style={styles.texasOutline}>
        <Feather name="map-pin" size={24} color={theme.secondaryText} />
        <ThemedText type="caption" style={{ color: theme.secondaryText, marginTop: Spacing.xs }}>
          Texas Map View
        </ThemedText>
        <ThemedText type="small" style={{ color: theme.secondaryText, marginTop: Spacing.xs, textAlign: "center" }}>
          Tap a district marker to view details
        </ThemedText>
      </View>

      {senatePositions.map((pos) => (
        <DistrictButton
          key={`senate-${pos.number}`}
          type="senate"
          number={pos.number}
          x={pos.x * (width - 80)}
          y={pos.y * mapHeight}
          isSelected={
            selectedDistrict?.type === "senate" &&
            selectedDistrict.number === pos.number
          }
          isVisible={overlays.senate}
          onPress={() => onDistrictSelect("senate", pos.number)}
          color={theme.senateBorder}
        />
      ))}

      {housePositions.map((pos) => (
        <DistrictButton
          key={`house-${pos.number}`}
          type="house"
          number={pos.number}
          x={pos.x * (width - 80) + 10}
          y={pos.y * mapHeight + 10}
          isSelected={
            selectedDistrict?.type === "house" &&
            selectedDistrict.number === pos.number
          }
          isVisible={overlays.house}
          onPress={() => onDistrictSelect("house", pos.number)}
          color={theme.houseBorder}
        />
      ))}

      {congressPositions.map((pos) => (
        <DistrictButton
          key={`congress-${pos.number}`}
          type="congress"
          number={pos.number}
          x={pos.x * (width - 80) - 10}
          y={pos.y * mapHeight + 20}
          isSelected={
            selectedDistrict?.type === "congress" &&
            selectedDistrict.number === pos.number
          }
          isVisible={overlays.congress}
          onPress={() => onDistrictSelect("congress", pos.number)}
          color={theme.congressBorder}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    position: "relative",
  },
  texasOutline: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
  },
  districtButton: {
    position: "absolute",
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  districtButtonInner: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
});
