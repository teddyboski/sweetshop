import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import type { NavigatorScreenParams } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { ShopStack } from "./ShopStack";
import { SearchStack } from "./SearchStack";
import { CartStack } from "./CartStack";
import { AccountStack, type AccountStackParamList } from "./AccountStack";
import { colors } from "../theme";

export type RootTabParamList = {
  ShopTab: undefined;
  SearchTab: undefined;
  CartTab: undefined;
  // NavigatorScreenParams (not `undefined`) so screens on other tabs can
  // deep-link into a specific AccountStack screen, e.g.
  // navigation.navigate("AccountTab", { screen: "Rewards" }) - Milestone
  // 18's homepage/Shop tile menu needs this for the Rewards/Referrals
  // tiles, which live on this tab, not ShopStack.
  AccountTab: NavigatorScreenParams<AccountStackParamList>;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

const TAB_ICONS: Record<keyof RootTabParamList, keyof typeof Ionicons.glyphMap> = {
  ShopTab: "storefront",
  SearchTab: "search",
  CartTab: "cart",
  AccountTab: "person",
};

/**
 * Bottom tab navigator mirroring the web app's route groups conceptually
 * - (shop)+(marketing) -> Shop, (account) -> Account - without literally
 * copying URL structure, per the Milestone 11 plan. Each tab owns its own
 * native-stack navigator (ShopStack, SearchStack, CartStack, AccountStack)
 * so future detail screens (box detail, order detail, etc.) push within
 * their tab rather than needing a separate top-level stack.
 */
export function RootTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={TAB_ICONS[route.name as keyof RootTabParamList]} size={size} color={color} />
        ),
      })}
    >
      <Tab.Screen name="ShopTab" component={ShopStack} options={{ title: "Shop" }} />
      <Tab.Screen name="SearchTab" component={SearchStack} options={{ title: "Search" }} />
      <Tab.Screen name="CartTab" component={CartStack} options={{ title: "Cart" }} />
      <Tab.Screen name="AccountTab" component={AccountStack} options={{ title: "Account" }} />
    </Tab.Navigator>
  );
}
