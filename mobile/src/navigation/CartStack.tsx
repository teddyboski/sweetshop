import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { CartScreen } from "../screens/cart/CartScreen";
import { CheckoutScreen } from "../screens/checkout/CheckoutScreen";
import { OrderConfirmationScreen } from "../screens/checkout/OrderConfirmationScreen";
import { colors } from "../theme";

export type CartStackParamList = {
  Cart: undefined;
  Checkout: undefined;
  OrderConfirmation: { paymentIntentId: string };
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
      <Stack.Screen name="Checkout" component={CheckoutScreen} options={{ title: "Checkout" }} />
      <Stack.Screen
        name="OrderConfirmation"
        component={OrderConfirmationScreen}
        options={{ title: "Order Confirmation", headerBackVisible: false, gestureEnabled: false }}
      />
    </Stack.Navigator>
  );
}
