import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { AccountScreen } from "../screens/account/AccountScreen";
import { LoginScreen } from "../screens/account/LoginScreen";
import { OrdersScreen } from "../screens/account/OrdersScreen";
import { OrderDetailScreen } from "../screens/account/OrderDetailScreen";
import { SubscriptionsScreen } from "../screens/account/SubscriptionsScreen";
import { RewardsScreen } from "../screens/account/RewardsScreen";
import { ReferralsScreen } from "../screens/account/ReferralsScreen";
import { useAuth } from "../lib/auth/auth-context";
import { colors } from "../theme";

export type AccountStackParamList = {
  Login: undefined;
  Account: undefined;
  Orders: undefined;
  OrderDetail: { id: string };
  Subscriptions: undefined;
  Rewards: undefined;
  Referrals: undefined;
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
 *
 * Milestone 14: Orders/OrderDetail/Subscriptions/Rewards/Referrals only
 * ever render once `session` is truthy (they're pushed from AccountScreen,
 * which only renders in the signed-in branch below) - still registered
 * unconditionally on the navigator either way, same as every other stack in
 * this app, since React Navigation resolves screens by name at push time,
 * not by which branch originally mounted the navigator.
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
        <>
          <Stack.Screen name="Account" component={AccountScreen} options={{ title: "Account" }} />
          <Stack.Screen name="Orders" component={OrdersScreen} options={{ title: "Order History" }} />
          <Stack.Screen name="OrderDetail" component={OrderDetailScreen} options={{ title: "" }} />
          <Stack.Screen name="Subscriptions" component={SubscriptionsScreen} options={{ title: "Subscriptions" }} />
          <Stack.Screen name="Rewards" component={RewardsScreen} options={{ title: "Rewards" }} />
          <Stack.Screen name="Referrals" component={ReferralsScreen} options={{ title: "Refer Friends" }} />
        </>
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} options={{ title: "Sign In", headerShown: false }} />
      )}
    </Stack.Navigator>
  );
}
