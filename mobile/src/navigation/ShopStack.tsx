import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ShopHomeScreen } from "../screens/shop/ShopHomeScreen";
import { BoxDetailScreen } from "../screens/shop/BoxDetailScreen";
import { SnackDetailScreen } from "../screens/shop/SnackDetailScreen";
import { DropsScreen } from "../screens/shop/DropsScreen";
import { BuildABoxScreen } from "../screens/shop/BuildABoxScreen";
import { SnackBoxesScreen } from "../screens/shop/SnackBoxesScreen";
import { CandyBoxesScreen } from "../screens/shop/CandyBoxesScreen";
import { MysteryBoxScreen } from "../screens/shop/MysteryBoxScreen";
import { colors } from "../theme";

export type ShopStackParamList = {
  ShopHome: undefined;
  BoxDetail: { slug: string };
  SnackDetail: { slug: string };
  Drops: undefined;
  BuildABox: undefined;
  SnackBoxes: undefined;
  CandyBoxes: undefined;
  MysteryBox: undefined;
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
      <Stack.Screen name="SnackBoxes" component={SnackBoxesScreen} options={{ title: "Snack Boxes" }} />
      <Stack.Screen name="CandyBoxes" component={CandyBoxesScreen} options={{ title: "Candy Boxes" }} />
      <Stack.Screen name="MysteryBox" component={MysteryBoxScreen} options={{ title: "Mystery Box" }} />
    </Stack.Navigator>
  );
}
