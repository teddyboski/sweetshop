import { ActivityIndicator, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./src/lib/auth/auth-context";
import { RootTabs } from "./src/navigation/RootTabs";
import { colors } from "./src/theme";

/**
 * Milestone 12: one shared client for all catalog reads. staleTime is
 * intentionally not 0 - catalog data (boxes/snacks/drops) changes rarely
 * enough that refetching on every screen focus would just be wasted
 * requests against the rate limit budget; 60s roughly matches the web
 * shop pages' own `revalidate: 60` ISR window, so both platforms are
 * "at most a minute stale" by the same standard.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      retry: 1,
    },
  },
});

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.card,
    text: colors.foreground,
    border: colors.border,
  },
};

function AppShell() {
  const { isLoading } = useAuth();

  // Only the initial SecureStore session lookup blocks here - this is what
  // makes "a signed-in session survives an app restart" (Milestone 11
  // completion criterion) an observable launch behavior: without this
  // guard, the tab bar would briefly flash the signed-out Account tab
  // before the restored session arrives.
  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navigationTheme}>
      <RootTabs />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <AuthProvider>
          <AppShell />
        </AuthProvider>
        <StatusBar style="auto" />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
});
