import { Platform } from "react-native";

export const Colors = {
  light: {
    text: "#1A1A1A",
    secondaryText: "#666666",
    buttonText: "#FFFFFF",
    tabIconDefault: "#687076",
    tabIconSelected: "#0047BB",
    link: "#0047BB",
    backgroundRoot: "#FFFFFF",
    backgroundDefault: "#F8F9FA",
    backgroundSecondary: "#E0E0E0",
    backgroundTertiary: "#D0D0D0",
    primary: "#0047BB",
    secondary: "#BF0A30",
    border: "#E0E0E0",
    success: "#28A745",
    warning: "#FFC107",
    overlaySenate: "rgba(74, 144, 226, 0.4)",
    overlayHouse: "rgba(233, 75, 60, 0.4)",
    overlayCongress: "rgba(80, 200, 120, 0.4)",
    overlaySenateHighlight: "rgba(74, 144, 226, 0.6)",
    overlayHouseHighlight: "rgba(233, 75, 60, 0.6)",
    overlayCongressHighlight: "rgba(80, 200, 120, 0.6)",
    senateBorder: "#4A90E2",
    houseBorder: "#E94B3C",
    congressBorder: "#50C878",
    cardBackground: "#FFFFFF",
    inputBackground: "#F8F9FA",
  },
  dark: {
    text: "#ECEDEE",
    secondaryText: "#9BA1A6",
    buttonText: "#FFFFFF",
    tabIconDefault: "#9BA1A6",
    tabIconSelected: "#4A90E2",
    link: "#4A90E2",
    backgroundRoot: "#1A1A1A",
    backgroundDefault: "#242424",
    backgroundSecondary: "#2E2E2E",
    backgroundTertiary: "#383838",
    primary: "#4A90E2",
    secondary: "#E94B3C",
    border: "#3A3A3A",
    success: "#28A745",
    warning: "#FFC107",
    overlaySenate: "rgba(74, 144, 226, 0.4)",
    overlayHouse: "rgba(233, 75, 60, 0.4)",
    overlayCongress: "rgba(80, 200, 120, 0.4)",
    overlaySenateHighlight: "rgba(74, 144, 226, 0.6)",
    overlayHouseHighlight: "rgba(233, 75, 60, 0.6)",
    overlayCongressHighlight: "rgba(80, 200, 120, 0.6)",
    senateBorder: "#4A90E2",
    houseBorder: "#E94B3C",
    congressBorder: "#50C878",
    cardBackground: "#242424",
    inputBackground: "#2E2E2E",
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  inputHeight: 48,
  buttonHeight: 52,
};

export const BorderRadius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const Typography = {
  h1: {
    fontSize: 28,
    fontWeight: "700" as const,
  },
  h2: {
    fontSize: 22,
    fontWeight: "700" as const,
  },
  h3: {
    fontSize: 18,
    fontWeight: "600" as const,
  },
  body: {
    fontSize: 16,
    fontWeight: "400" as const,
  },
  caption: {
    fontSize: 14,
    fontWeight: "400" as const,
  },
  small: {
    fontSize: 12,
    fontWeight: "400" as const,
  },
};

export const Shadows = {
  sm: Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
    },
    android: {
      elevation: 2,
    },
    default: {},
  }),
  md: Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
    },
    android: {
      elevation: 4,
    },
    default: {},
  }),
  lg: Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
    },
    android: {
      elevation: 8,
    },
    default: {},
  }),
};

export const Fonts = Platform.select({
  ios: {
    sans: "system-ui",
    serif: "ui-serif",
    rounded: "ui-rounded",
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
