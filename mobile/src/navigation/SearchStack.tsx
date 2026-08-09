import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SearchScreen } from "../screens/search/SearchScreen";
import { colors } from "../theme";

export type SearchStackParamList = {
  Search: undefined;
};

const Stack = createNativeStackNavigator<SearchStackParamList>();

export function SearchStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.foreground,
      }}
    >
      <Stack.Screen name="Search" component={SearchScreen} options={{ title: "Search" }} />
    </Stack.Navigator>
  );
}
