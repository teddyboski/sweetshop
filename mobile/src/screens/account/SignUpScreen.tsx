import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors, radii, spacing, typography } from "../../theme";
import { useAuth } from "../../lib/auth/auth-context";
import { PasswordInput } from "../../components/shared/PasswordInput";
import type { AccountStackParamList } from "../../navigation/AccountStack";

type Nav = NativeStackNavigationProp<AccountStackParamList, "SignUp">;

/**
 * Milestone 23: sign-up finally lives natively on mobile - mirrors
 * (auth)/signup/page.tsx exactly (same Supabase Auth project, same
 * signUp() call, same "check your email" confirmation-required flow).
 * No mobile deep-link back into the app after confirming - the
 * confirmation link opens in the phone's browser same as any email link,
 * and the person just returns to this app and logs in. A real deep-link
 * return trip is a bigger, separate piece of work, not needed just to
 * unblock sign-up existing at all.
 */
export function SignUpScreen() {
  const navigation = useNavigation<Nav>();
  const { signUp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit() {
    setError(null);
    setIsSubmitting(true);
    const { error: signUpError } = await signUp(email.trim(), password);
    setIsSubmitting(false);
    if (signUpError) {
      setError(signUpError);
      return;
    }
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <View style={styles.container}>
        <Text style={styles.heading}>Check your email</Text>
        <Text style={styles.body}>
          We sent a confirmation link to {email}. Tap it to activate your account, then come back here and log in.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Create your account</Text>

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
        placeholder="Password (min. 8 characters)"
        autoComplete="password-new"
        value={password}
        onChangeText={setPassword}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity
        style={[styles.button, isSubmitting && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={isSubmitting || !email || password.length < 8}
      >
        {isSubmitting ? (
          <ActivityIndicator color={colors.primaryForeground} />
        ) : (
          <Text style={styles.buttonText}>Sign Up</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.link}>Already have an account? Log in</Text>
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
  body: {
    ...typography.sizes.base,
    color: colors.mutedForeground,
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
