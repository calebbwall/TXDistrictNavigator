import React from "react";
import { View, StyleSheet } from "react-native";
import { ThemedText } from "@/components/ThemedText";

interface PartyBadgeProps {
  party: string | null | undefined;
  size?: "small" | "medium";
}

const PARTY_COLORS: Record<string, { background: string; text: string }> = {
  R: { background: "#DC2626", text: "#FFFFFF" },
  D: { background: "#2563EB", text: "#FFFFFF" },
  I: { background: "#6B7280", text: "#FFFFFF" },
};

export function PartyBadge({ party, size = "small" }: PartyBadgeProps) {
  if (!party) return null;

  const partyCode = party.charAt(0).toUpperCase();
  const colors = PARTY_COLORS[partyCode] || PARTY_COLORS.I;
  const badgeSize = size === "small" ? 18 : 22;
  const fontSize = size === "small" ? 11 : 13;

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: colors.background,
          width: badgeSize,
          height: badgeSize,
          borderRadius: badgeSize / 2,
        },
      ]}
    >
      <ThemedText
        style={[
          styles.text,
          { color: colors.text, fontSize, lineHeight: fontSize + 2 },
        ]}
      >
        {partyCode}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    fontWeight: "700",
  },
});
