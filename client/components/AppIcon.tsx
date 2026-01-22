import React from "react";
import { Feather } from "@expo/vector-icons";
import type { ComponentProps } from "react";

type FeatherIconName = ComponentProps<typeof Feather>["name"];

interface AppIconProps {
  name: FeatherIconName;
  size?: number;
  color?: string;
  style?: object;
}

export default function AppIcon({ name, size = 24, color = "#000", style }: AppIconProps) {
  return <Feather name={name} size={size} color={color} style={style} />;
}

export type { FeatherIconName as IconName };
