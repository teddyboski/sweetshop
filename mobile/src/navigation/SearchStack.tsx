import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SearchScreen } from "../screens/search/SearchScreen";
import { BoxDetailScreen } from "../screens/shop/BoxDetailScreen";
import { SnackDetailScreen } from "../screens/shop/SnackDetailScreen";
import { colors } from "../theme";

export type SearchStackParamList = {
  Search: undefined;
  BoxDetail: { slug: string };
  SnackDetail: { slug: string };
};

const Stack = createNativeStackNavigator<SearchStackParamList>();

/**
 * BoxDetail/SnackDetail are registered here too (same screen components
 * ShopStack uses) so a search result pushes within the Search tab's own
 * stack, not the Shop tab's - standard per-tab navigation, avoids jumping
 * the user to a different tab than the one they tapped from.
 */
export function SearchStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.foreground,
      }}
    >
      <Stack.Screen name="Search" component={SearchScreen} options={{ title: "Search" }} />
      <Stack.Screen name="BoxDetail" component={BoxDetailScreen} options={{ title: "" }} />
      <Stack.Screen name="SnackDetail" component={SnackDetailScreen} options={{ title: "" }} />
    </Stack.Navigator>
  );
}
