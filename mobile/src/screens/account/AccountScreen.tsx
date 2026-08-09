import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radii, spacing, typography } from "../../theme";
import { useAuth } from "../../lib/auth/auth-context";
import { authenticatedFetch } from "../../lib/api/authenticated-fetch";

type ApiTestResult = { status: number; body: string } | { networkError: string };

/**
 * Milestone 11 completion-criteria proof screen: confirms the mobile app
 * can call an existing web /api/* route with a bearer token and get a real
 * response, not just that supabase-js locally believes it has a session.
 *
 * Uses PATCH /api/account/preferences (the only /api/account/* route that
 * exists today - reads still go through Server Components on web, per the
 * mobile roadmap's Milestone 12 ground-truth note, so no GET route exists
 * yet to test against). This does write real defaults to the signed-in
 * user's customer_preferences row - fine for a personal test account, but
 * worth knowing before running it against a real customer's account.
 */
export function AccountScreen() {
  const { session, signOut } = useAuth();
  const [result, setResult] = useState<ApiTestResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  async function runApiTest() {
    setIsTesting(true);
    setResult(null);
    try {
      const response = await authenticatedFetch("/api/account/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await response.text();
      setResult({ status: response.status, body });
    } catch (err) {
      setResult({ networkError: err instanceof Error ? err.message : String(err) });
    } finally {
      setIsTesting(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Account</Text>
      <Text style={styles.email}>{session?.user.email}</Text>

      <TouchableOpacity style={styles.secondaryButton} onPress={runApiTest} disabled={isTesting}>
        {isTesting ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Text style={styles.secondaryButtonText}>Test API connection (bearer token)</Text>
        )}
      </TouchableOpacity>

      {result ? (
        <View style={styles.resultBox}>
          {"status" in result ? (
            <>
              <Text style={styles.resultLabel}>HTTP {result.status}</Text>
              <Text style={styles.resultBody}>{result.body}</Text>
            </>
          ) : (
            <Text style={[styles.resultLabel, { color: colors.destructive }]}>
              Network error: {result.networkError}
            </Text>
          )}
        </View>
      ) : null}

      <TouchableOpacity style={styles.button} onPress={signOut}>
        <Text style={styles.buttonText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing["2xl"],
  },
  heading: {
    ...typography.sizes["2xl"],
    fontFamily: typography.fontFamilyMedium,
    color: colors.foreground,
    marginBottom: spacing.xs,
  },
  email: {
    ...typography.sizes.sm,
    color: colors.mutedForeground,
    marginBottom: spacing["3xl"],
  },
  button: {
    backgroundColor: colors.destructive,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing["3xl"],
  },
  buttonText: {
    color: colors.destructiveForeground,
    fontFamily: typography.fontFamilyMedium,
    ...typography.sizes.base,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: colors.primary,
    fontFamily: typography.fontFamilyMedium,
    ...typography.sizes.base,
  },
  resultBox: {
    backgroundColor: colors.muted,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  resultLabel: {
    fontFamily: typography.fontFamilyMedium,
    color: colors.foreground,
    marginBottom: spacing.xs,
    ...typography.sizes.sm,
  },
  resultBody: {
    color: colors.mutedForeground,
    ...typography.sizes.xs,
  },
});
