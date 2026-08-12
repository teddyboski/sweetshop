import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ShopHomeScreen } from "../screens/shop/ShopHomeScreen";
import { BoxDetailScreen } from "../screens/shop/BoxDetailScreen";
import { SnackDetailScreen } from "../screens/shop/SnackDetailScreen";
import { DropsScreen } from "../screens/shop/DropsScreen";
import { BuildABoxScreen } from "../screens/shop/BuildABoxScreen";
import { colors } from "../theme";

export type ShopStackParamList = {
  ShopHome: undefined;
  BoxDetail: { slug: string };
  SnackDetail: { slug: string };
  Drops: undefined;
  BuildABox: undefined;
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
      <Stack.Screen name="BoxDetail" component={BoxDetailScreen} options={{ title: "" }} />
      <Stack.Screen name="SnackDetail" component={SnackDetailScreen} options={{ title: "" }} />
      <Stack.Screen name="Drops" component={DropsScreen} options={{ title: "Drops" }} />
      <Stack.Screen name="BuildABox" component={BuildABoxScreen} options={{ title: "Build a Box" }} />
    </Stack.Navigator>
  );
}
