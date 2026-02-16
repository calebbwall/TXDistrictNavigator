import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";
import {
  View,
  Animated,
  Pressable,
  StyleSheet,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";

interface ToastOptions {
  undoAction?: () => void;
}

interface ToastContextType {
  showToast: (message: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast(): ToastContextType {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

interface ToastState {
  message: string;
  undoAction?: () => void;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const dismissToast = useCallback(() => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: false,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: false,
      }),
    ]).start(() => {
      setToast(null);
    });

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, [slideAnim, opacityAnim]);

  const showToast = useCallback(
    (message: string, options?: ToastOptions) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      setToast({ message, undoAction: options?.undoAction });

      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: false,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: false,
        }),
      ]).start();

      const duration = options?.undoAction ? 8000 : 3000;
      timeoutRef.current = setTimeout(() => {
        dismissToast();
      }, duration);
    },
    [slideAnim, opacityAnim, dismissToast]
  );

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const slideTranslate = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [100, 0],
  });

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast ? (
        <Animated.View
          style={[
            styles.container,
            {
              bottom: insets.bottom + Spacing.lg,
              transform: [{ translateY: slideTranslate }],
              opacity: opacityAnim,
            },
          ]}
        >
          <View
            style={[
              styles.toastContent,
              {
                backgroundColor: "#1A1A1A",
                paddingHorizontal: Spacing.lg,
                paddingVertical: Spacing.md,
              },
            ]}
          >
            <View style={styles.messageContainer}>
              <ThemedText
                lightColor="#FFFFFF"
                darkColor="#FFFFFF"
                type="body"
                style={styles.messageText}
              >
                {toast.message}
              </ThemedText>
              {toast.undoAction ? (
                <Pressable
                  onPress={() => {
                    toast.undoAction?.();
                    dismissToast();
                  }}
                  style={({ pressed }) => [
                    styles.undoButton,
                    {
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <ThemedText
                    lightColor="#4A90E2"
                    darkColor="#4A90E2"
                    type="body"
                    style={styles.undoText}
                  >
                    Undo
                  </ThemedText>
                </Pressable>
              ) : null}
            </View>
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    zIndex: 9999,
  },
  toastContent: {
    borderRadius: BorderRadius.full,
    maxWidth: "100%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  messageContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
  },
  messageText: {
    flex: 1,
    color: "#FFFFFF",
    fontWeight: "500" as const,
  },
  undoButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  undoText: {
    color: "#4A90E2",
    fontWeight: "600" as const,
  },
});
