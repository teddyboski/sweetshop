import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { fetchBoxes, type CatalogBox } from "../../lib/api/catalog";
import { addBuildABoxToCart } from "../../lib/api/cart";
import { formatPriceCents } from "../../lib/utils/format";
import { useToast } from "../../lib/toast/toast-context";
import { colors, radii, spacing, typography } from "../../theme";
import type { ShopStackParamList } from "../../navigation/ShopStack";

type Nav = NativeStackNavigationProp<ShopStackParamList, "BuildABox">;

const SNACK_TYPES = [
  { key: "chips", label: "Chips / Crisps" },
  { key: "candy", label: "Candy" },
  { key: "cookies", label: "Cookies" },
  { key: "cakes", label: "Cakes / Pastries" },
  { key: "crackers", label: "Crackers" },
  { key: "nuts", label: "Nuts / Trail Mix" },
  { key: "gummies", label: "Gummies" },
  { key: "chocolate", label: "Chocolate" },
] as const;

const FLAVORS = [
  { key: "sweet", label: "Sweet" },
  { key: "salty", label: "Salty" },
  { key: "spicy", label: "Spicy / Hot" },
  { key: "sour", label: "Sour" },
  { key: "savory", label: "Savory" },
  { key: "fruity", label: "Fruity" },
  { key: "chocolatey", label: "Chocolatey" },
] as const;

type SnackTypeKey = typeof SNACK_TYPES[number]["key"];
type FlavorKey = typeof FLAVORS[number]["key"];

export function BuildABoxScreen() {
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const boxesQuery = useQuery({
    queryKey: ["catalog", "boxes"],
    queryFn: () => fetchBoxes(),
  });

  const [selectedBox, setSelectedBox] = useState<CatalogBox | null>(null);
  const [selectedSnackTypes, setSelectedSnackTypes] = useState<Set<SnackTypeKey>>(new Set());
  const [selectedFlavors, setSelectedFlavors] = useState<Set<FlavorKey>>(new Set());

  const buildABoxes = (boxesQuery.data ?? [])
    .filter((box) => box.box_type === "build_a_box")
    .sort((a, b) => (a.slot_count ?? 0) - (b.slot_count ?? 0));

  function selectBox(box: CatalogBox) {
    setSelectedBox(box);
    setSelectedSnackTypes(new Set());
    setSelectedFlavors(new Set());
  }

  function toggleSnackType(key: SnackTypeKey) {
    setSelectedSnackTypes((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function toggleFlavor(key: FlavorKey) {
    setSelectedFlavors((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  const canSubmit =
    selectedBox !== null &&
    selectedSnackTypes.size > 0 &&
    selectedFlavors.size > 0;

  const submitMutation = useMutation({
    mutationFn: () =>
      addBuildABoxToCart(selectedBox!.slug, {
        snackTypes: Array.from(selectedSnackTypes),
        flavors: Array.from(selectedFlavors),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cart"] });
      showToast("Added to cart!");
      navigation.goBack();
    },
    onError: (err: Error) => {
      showToast(err.message ?? "Something went wrong. Please try again.");
    },
  });

  if (boxesQuery.isLoading) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Build Your Own Box</Text>
      <Text style={styles.subtitle}>
        Pick a size, then tell us your preferences — we will hand-pack it fresh.
      </Text>

      <Text style={styles.sectionTitle}>Step 1 — Choose a size</Text>
      <View style={styles.boxRow}>
        {buildABoxes.map((box) => {
          const selected = selectedBox?.id === box.id;
          return (
            <Pressable
              key={box.id}
              style={[styles.boxCard, selected && styles.boxCardSelected]}
              onPress={() => selectBox(box)}
            >
              <Text style={[styles.boxName, selected && styles.boxNameSelected]}>
                {box.title}
              </Text>
              <Text style={styles.boxMeta}>
                {formatPriceCents(box.price_cents)} · {box.slot_count} items
              </Text>
            </Pressable>
          );
        })}
      </View>

      {selectedBox && (
        <>
          <Text style={styles.sectionTitle}>Step 2 — Snack types</Text>
          <Text style={styles.sectionHint}>Check everything you would like included.</Text>
          <View style={styles.checkGrid}>
            {SNACK_TYPES.map(({ key, label }) => {
              const checked = selectedSnackTypes.has(key);
              return (
                <Pressable
                  key={key}
                  style={[styles.checkItem, checked && styles.checkItemSelected]}
                  onPress={() => toggleSnackType(key)}
                >
                  <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                    {checked && <Text style={styles.checkmark}>?</Text>}
                  </View>
                  <Text style={[styles.checkLabel, checked && styles.checkLabelSelected]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.sectionTitle}>Step 3 — Flavor preferences</Text>
          <Text style={styles.sectionHint}>Check all the flavors you enjoy.</Text>
          <View style={styles.checkGrid}>
            {FLAVORS.map(({ key, label }) => {
              const checked = selectedFlavors.has(key);
              return (
                <Pressable
                  key={key}
                  style={[styles.checkItem, checked && styles.checkItemSelected]}
                  onPress={() => toggleFlavor(key)}
                >
                  <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                    {checked && <Text style={styles.checkmark}>?</Text>}
                  </View>
                  <Text style={[styles.checkLabel, checked && styles.checkLabelSelected]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
            disabled={!canSubmit || submitMutation.isPending}
            onPress={() => submitMutation.mutate()}
          >
            <Text style={styles.submitBtnText}>
              {submitMutation.isPending ? "Adding..." : `Add to Cart — ${formatPriceCents(selectedBox.price_cents)}`}
            </Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing[4], paddingBottom: spacing[12] },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { ...typography.heading, fontSize: 22, color: colors.foreground },
  subtitle: { ...typography.body, color: colors.mutedForeground, marginTop: spacing[1], marginBottom: spacing[2] },
  sectionTitle: { ...typography.heading, fontSize: 16, color: colors.foreground, marginTop: spacing[6], marginBottom: spacing[1] },
  sectionHint: { ...typography.body, fontSize: 13, color: colors.mutedForeground, marginBottom: spacing[3] },
  muted: { color: colors.mutedForeground },
  boxRow: { flexDirection: "row", gap: spacing[3], flexWrap: "wrap" },
  boxCard: { flex: 1, minWidth: 100, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing[3], backgroundColor: colors.card },
  boxCardSelected: { borderColor: colors.primary, backgroundColor: colors.primary + "0D" },
  boxName: { ...typography.body, fontWeight: "600", color: colors.foreground },
  boxNameSelected: { color: colors.primary },
  boxMeta: { ...typography.body, fontSize: 12, color: colors.mutedForeground, marginTop: spacing[1] },
  checkGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing[2] },
  checkItem: { flexDirection: "row", alignItems: "center", gap: spacing[2], borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: spacing[3], paddingVertical: spacing[2], backgroundColor: colors.card },
  checkItemSelected: { borderColor: colors.primary, backgroundColor: colors.primary + "0D" },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkmark: { color: "#fff", fontSize: 11, fontWeight: "700" },
  checkLabel: { ...typography.body, fontSize: 13, color: colors.foreground },
  checkLabelSelected: { fontWeight: "600", color: colors.primary },
  submitBtn: { marginTop: spacing[8], backgroundColor: colors.primary, borderRadius: radii.md, paddingVertical: spacing[4], alignItems: "center" },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
