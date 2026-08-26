import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, spacing, typography } from "../../theme";

type PasswordInputProps = Omit<TextInputProps, "secureTextEntry" | "style">;

/**
 * Milestone 23: shared eye-toggle password field for Login/SignUp, mirrors
 * src/components/shared/password-input.tsx's web behavior - a plain
 * visibility toggle, not a strength meter or anything more.
 */
export function PasswordInput(props: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.wrap}>
      <TextInput
        style={styles.input}
        placeholderTextColor={colors.mutedForeground}
        secureTextEntry={!visible}
        {...props}
      />
      <Pressable
        style={styles.toggle}
        onPress={() => setVisible((v) => !v)}
        hitSlop={8}
        accessibilityLabel={visible ? "Hide password" : "Show password"}
      >
        <Ionicons name={visible ? "eye-off-outline" : "eye-outline"} size={20} color={colors.mutedForeground} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingRight: spacing["3xl"],
    paddingVertical: spacing.md,
    color: colors.foreground,
    ...typography.sizes.base,
  },
  toggle: {
    position: "absolute",
    right: spacing.md,
    height: "100%",
    justifyContent: "center",
  },
});
