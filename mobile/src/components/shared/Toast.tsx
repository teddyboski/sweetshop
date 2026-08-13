import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useToast } from "../../lib/toast/toast-context";
import { colors, radii, spacing, typography } from "../../theme";

/**
 * Rendered once at the app root (App.tsx), sits above the tab bar. Pure
 * react-native Animated (no reanimated/haptics) so this ships over an EAS
 * OTA update without needing a new native build.
 */
export function Toast() {
  const { toast } = useToast();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(40)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!toast) return;
    translateY.setValue(24);
    opacity.setValue(0);
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 7, tension: 60 }),
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();

    return () => {
      Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }).start();
    };
  }, [toast, translateY, opacity]);

  if (!toast) return null;

  const isError = toast.variant === "error";

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.wrap,
        { bottom: insets.bottom + spacing.xl, opacity, transform: [{ translateY }] },
        isError ? styles.error : styles.success,
      ]}
    >
      <Ionicons
        name={isError ? "alert-circle" : "checkmark-circle"}
        size={20}
        color={isError ? colors.destructiveForeground : colors.successForeground}
      />
      <Text style={[styles.text, { color: isError ? colors.destructiveForeground : colors.successForeground }]}>
        {toast.message}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radii.full,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  success: {
    backgroundColor: colors.success,
  },
  error: {
    backgroundColor: colors.destructive,
  },
  text: {
    ...typography.sizes.sm,
    fontFamily: typography.fontFamilyMedium,
    flex: 1,
  },
});
