import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { CartScreen } from "../screens/cart/CartScreen";
import { colors } from "../theme";

export type CartStackParamList = {
  Cart: undefined;
  // Checkout screens land here in Milestone 13.
};

const Stack = createNativeStackNavigator<CartStackParamList>();

export function CartStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.foreground,
      }}
    >
      <Stack.Screen name="Cart" component={CartScreen} options={{ title: "Cart" }} />
    </Stack.Navigator>
  );
}
