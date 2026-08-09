import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { colors, radii, spacing, typography } from "../../theme";
import { useAuth } from "../../lib/auth/auth-context";

/**
 * Email/password sign-in only for Milestone 11 - matches the web app's
 * existing account model (same Supabase Auth project), but magic-link and
 * sign-up screens are deliberately deferred: this milestone's completion
 * criteria only require proving a session persists and authenticates
 * against the API, not a full parity auth UI. Full auth flows (sign-up,
 * magic link, forgot password) are real work, just not this milestone's.
 */
export function LoginScreen() {
  const { signInWithPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setIsSubmitting(true);
    const { error: signInError } = await signInWithPassword(email.trim(), password);
    setIsSubmitting(false);
    if (signInError) setError(signInError);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Sign in to Sweet Shop</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor={colors.mutedForeground}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor={colors.mutedForeground}
        secureTextEntry
        autoComplete="password"
        value={password}
        onChangeText={setPassword}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity
        style={[styles.button, isSubmitting && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={isSubmitting || !email || !password}
      >
        {isSubmitting ? (
          <ActivityIndicator color={colors.primaryForeground} />
        ) : (
          <Text style={styles.buttonText}>Sign In</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.hint}>Use the same account you use on the web app - same Supabase project.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    padding: spacing["2xl"],
  },
  heading: {
    ...typography.sizes["2xl"],
    fontFamily: typography.fontFamilyMedium,
    color: colors.foreground,
    marginBottom: spacing["2xl"],
    textAlign: "center",
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
    color: colors.foreground,
    ...typography.sizes.base,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: colors.primaryForeground,
    fontFamily: typography.fontFamilyMedium,
    ...typography.sizes.base,
  },
  error: {
    color: colors.destructive,
    marginBottom: spacing.md,
    ...typography.sizes.sm,
  },
  hint: {
    color: colors.mutedForeground,
    textAlign: "center",
    marginTop: spacing["2xl"],
    ...typography.sizes.xs,
  },
});
