import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ShopHomeScreen } from "../screens/shop/ShopHomeScreen";
import { colors } from "../theme";

export type ShopStackParamList = {
  ShopHome: undefined;
  // BoxDetail / SnackDetail / DropDetail land here in Milestone 12.
};

const Stack = createNativeStackNavigator<ShopStackParamList>();

export function ShopStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.foreground,
      }}
    >
      <Stack.Screen name="ShopHome" component={ShopHomeScreen} options={{ title: "Shop" }} />
    </Stack.Navigator>
  );
}
