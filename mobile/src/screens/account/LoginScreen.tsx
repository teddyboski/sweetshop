import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors, radii, spacing, typography } from "../../theme";
import { useAuth } from "../../lib/auth/auth-context";
import { PasswordInput } from "../../components/shared/PasswordInput";
import type { AccountStackParamList } from "../../navigation/AccountStack";

type Nav = NativeStackNavigationProp<AccountStackParamList, "Login">;

/**
 * Email/password sign-in, matching the web app's existing account model
 * (same Supabase Auth project). Magic-link and forgot-password screens are
 * still deferred - real work, just not in scope here - but Milestone 23
 * adds the sign-up screen this comment used to say was deliberately
 * skipped, so people no longer have to go create an account on the web
 * app first.
 */
export function LoginScreen() {
  const navigation = useNavigation<Nav>();
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
      <PasswordInput
        placeholder="Password"
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

      <TouchableOpacity onPress={() => navigation.navigate("SignUp")}>
        <Text style={styles.link}>Don&apos;t have an account? Sign up</Text>
      </TouchableOpacity>
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
  link: {
    color: colors.primary,
    textAlign: "center",
    marginTop: spacing["2xl"],
    ...typography.sizes.sm,
  },
});
