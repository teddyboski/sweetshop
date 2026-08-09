import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { colors, radii, spacing } from "../../theme";

/**
 * Loading placeholder for ProductCard grids. A pulsing static block beats a
 * spinner-then-pop layout shift for perceived performance - "table stakes
 * for not trash" per the Milestone 12 plan.
 */
export function SkeletonCard() {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity]);

  return (
    <Animated.View style={[styles.card, { opacity }]}>
      <View style={styles.image} />
      <View style={styles.line} />
      <View style={[styles.line, styles.shortLine]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    padding: spacing.sm,
  },
  image: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: radii.md,
    backgroundColor: colors.muted,
  },
  line: {
    height: 12,
    borderRadius: radii.sm,
    backgroundColor: colors.muted,
    marginTop: spacing.sm,
  },
  shortLine: {
    width: "50%",
    marginTop: spacing.xs,
  },
});
