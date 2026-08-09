import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { AccountScreen } from "../screens/account/AccountScreen";
import { LoginScreen } from "../screens/account/LoginScreen";
import { useAuth } from "../lib/auth/auth-context";
import { colors } from "../theme";

export type AccountStackParamList = {
  Login: undefined;
  Account: undefined;
  // Orders / Subscriptions / Preferences / Rewards / Referrals land here in Milestone 14.
};

const Stack = createNativeStackNavigator<AccountStackParamList>();

/**
 * Swaps between Login and the signed-in Account screen based on session
 * state, inside the Account tab's own stack - rather than a separate
 * top-level Auth flow that replaces the whole tab bar. Chosen because
 * Milestone 13's cart/checkout and Milestone 12's catalog browsing are
 * both meant to work for guests too (the web app supports guest checkout
 * - see CLAUDE.md's Milestone 2 decision), so signing in should feel like
 * unlocking one tab, not gating the whole app.
 */
export function AccountStack() {
  const { session } = useAuth();

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.foreground,
      }}
    >
      {session ? (
        <Stack.Screen name="Account" component={AccountScreen} options={{ title: "Account" }} />
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} options={{ title: "Sign In", headerShown: false }} />
      )}
    </Stack.Navigator>
  );
}
