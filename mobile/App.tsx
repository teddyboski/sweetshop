import { ActivityIndicator, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { AuthProvider, useAuth } from "./src/lib/auth/auth-context";
import { RootTabs } from "./src/navigation/RootTabs";
import { colors } from "./src/theme";

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
    <SafeAreaProvider>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
      <StatusBar style="auto" />
    </SafeAreaProvider>
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
