import React, { useRef, useCallback } from "react";
import { View, StyleSheet, Image, Pressable, Platform } from "react-native";

import { ThemedText } from "@/components/ThemedText";
import { Spacing } from "@/constants/theme";
import { useDebugFlags } from "@/hooks/useDebugFlags";

interface HeaderTitleProps {
  title: string;
  enableDebugToggle?: boolean;
}

const LONG_PRESS_DURATION = 2000;

export function HeaderTitle({ title, enableDebugToggle = false }: HeaderTitleProps) {
  const { toggleDebug } = useDebugFlags();
  const pressStart = useRef<number>(0);

  const handlePressIn = useCallback(() => {
    pressStart.current = Date.now();
  }, []);

  const handlePressOut = useCallback(() => {
    if (enableDebugToggle) {
      const pressDuration = Date.now() - pressStart.current;
      if (pressDuration >= LONG_PRESS_DURATION) {
        toggleDebug();
      }
    }
  }, [enableDebugToggle, toggleDebug]);

  const content = (
    <>
      <Image
        source={require("../../assets/images/icon.png")}
        style={styles.icon}
        resizeMode="contain"
      />
      <ThemedText style={styles.title}>{title}</ThemedText>
    </>
  );

  if (enableDebugToggle) {
    return (
      <Pressable
        style={styles.container}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        delayLongPress={LONG_PRESS_DURATION}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={styles.container}>{content}</View>;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
  },
  icon: {
    width: 28,
    height: 28,
    marginRight: Spacing.sm,
  },
  title: {
    fontSize: 17,
    fontWeight: "600",
  },
});
