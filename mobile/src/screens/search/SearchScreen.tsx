import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { searchCatalog } from "../../lib/api/catalog";
import { ProductCard } from "../../components/shared/ProductCard";
import { colors, spacing, typography } from "../../theme";
import type { SearchStackParamList } from "../../navigation/SearchStack";

type Nav = NativeStackNavigationProp<SearchStackParamList, "Search">;

/** Mirrors the query.q branch of (shop)/shop/page.tsx - same searchCatalog() results. */
export function SearchScreen() {
  const navigation = useNavigation<Nav>();
  const [input, setInput] = useState("");
  const [debounced, setDebounced] = useState("");

  // 300ms debounce - avoids firing a request on every keystroke against
  // the same rate-limit budget every other catalog call shares.
  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(input.trim()), 300);
    return () => clearTimeout(timeout);
  }, [input]);

  const { data, isFetching, isError } = useQuery({
    queryKey: ["catalog", "search", debounced],
    queryFn: () => searchCatalog(debounced),
    enabled: debounced.length > 0,
  });

  const results = [
    ...(data?.boxes.map((box) => ({ kind: "box" as const, ...box })) ?? []),
    ...(data?.snacks.map((snack) => ({ kind: "snack" as const, ...snack, title: snack.name })) ?? []),
  ];

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={colors.mutedForeground} />
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Search the catalog..."
          placeholderTextColor={colors.mutedForeground}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>

      {debounced.length === 0 ? (
        <View style={styles.centerState}>
          <Text style={styles.emptyText}>Search boxes and snacks by name.</Text>
        </View>
      ) : isFetching ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : isError ? (
        <View style={styles.centerState}>
          <Text style={styles.emptyText}>Search failed. Try again.</Text>
        </View>
      ) : results.length === 0 ? (
        <View style={styles.centerState}>
          <Ionicons name="search-outline" size={32} color={colors.mutedForeground} />
          <Text style={styles.emptyText}>No results for "{debounced}".</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => `${item.kind}-${item.id}`}
          numColumns={2}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.row}
          renderItem={({ item }) => (
            <ProductCard
              title={item.title}
              priceCents={item.price_cents}
              imageUrl={item.imageUrl}
              onPress={() =>
                item.kind === "box"
                  ? navigation.navigate("BoxDetail", { slug: item.slug })
                  : navigation.navigate("SnackDetail", { slug: item.slug })
              }
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    margin: spacing.lg,
    paddingHorizontal: spacing.md,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  input: {
    flex: 1,
    ...typography.sizes.base,
    color: colors.foreground,
  },
  grid: {
    padding: spacing.lg,
    paddingTop: 0,
  },
  row: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing["2xl"],
  },
  emptyText: {
    ...typography.sizes.sm,
    color: colors.mutedForeground,
    textAlign: "center",
  },
});
