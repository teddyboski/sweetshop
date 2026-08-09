import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "../../theme";

function getRemaining(targetIso: string) {
  const diff = new Date(targetIso).getTime() - Date.now();
  if (diff <= 0) return false as const;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);
  return { days, hours, minutes, seconds };
}

/**
 * Mirrors src/components/shared/drop-countdown.tsx's logic and tick
 * behavior exactly (same units, same 1s interval), targeting whatever ISO
 * timestamp the caller passes - DropsScreen uses this for both the
 * countdown-to-start and countdown-to-end cases.
 */
export function Countdown({ target, endedLabel }: { target: string; endedLabel: string }) {
  const [remaining, setRemaining] = useState<ReturnType<typeof getRemaining> | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setRemaining(getRemaining(target)), 1000);
    return () => clearInterval(interval);
  }, [target]);

  if (remaining === false) {
    return <Text style={styles.ended}>{endedLabel}</Text>;
  }

  const display = remaining ?? { days: 0, hours: 0, minutes: 0, seconds: 0 };
  return (
    <View style={styles.row} accessibilityRole="timer">
      {(["days", "hours", "minutes", "seconds"] as const).map((unit) => (
        <View key={unit} style={styles.unit}>
          <Text style={styles.value}>{remaining === null ? "--" : String(display[unit]).padStart(2, "0")}</Text>
          <Text style={styles.label}>{unit}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: spacing.lg,
  },
  unit: {
    alignItems: "center",
  },
  value: {
    ...typography.sizes.xl,
    fontFamily: typography.fontFamilyMedium,
    color: colors.foreground,
  },
  label: {
    ...typography.sizes.xs,
    color: colors.mutedForeground,
    textTransform: "uppercase",
  },
  ended: {
    ...typography.sizes.base,
    fontFamily: typography.fontFamilyMedium,
    color: colors.destructive,
  },
});
