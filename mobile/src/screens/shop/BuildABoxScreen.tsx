import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { fetchBoxes, fetchByoSnacks, type CatalogBox, type ByoSnack } from "../../lib/api/catalog";
import { addBuildABoxToCart } from "../../lib/api/cart";
import { formatPriceCents } from "../../lib/utils/format";
import { useToast } from "../../lib/toast/toast-context";
import { colors, radii, spacing, typography } from "../../theme";
import type { ShopStackParamList } from "../../navigation/ShopStack";

type Nav = NativeStackNavigationProp<ShopStackParamList, "BuildABox">;

/**
 * Mirrors src/components/features/build-a-box/build-a-box-picker.tsx's
 * flow exactly: pick a size, then pick exactly that many snacks from the
 * BYO-eligible list, submit via the same addBuildABoxToCart -> POST
 * /api/cart/items the web picker calls. Local component state instead of
 * the web version's Zustand store - no cross-screen persistence need here,
 * the whole picker lives on one screen.
 */
export function BuildABoxScreen() {
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const boxesQuery = useQuery({ queryKey: ["catalog", "boxes"], queryFn: () => fetchBoxes() });
  const snacksQuery = useQuery({ queryKey: ["catalog", "byo-snacks"], queryFn: fetchByoSnacks });

  const [selectedBox, setSelectedBox] = useState<CatalogBox | null>(null);
  const [selections, setSelections] = useState<Record<string, number>>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const buildABoxes = useMemo(
    () =>
      (boxesQuery.data ?? [])
        .filter((box) => box.box_type === "build_a_box")
        .sort((a, b) => (a.slot_count ?? 0) - (b.slot_count ?? 0)),
    [boxesQuery.data]
  );

  const picked = Object.values(selections).reduce((sum, qty) => sum + qty, 0);
  const target = selectedBox?.slot_count ?? 0;
  const canSubmit = selectedBox !== null && picked === target && status !== "submitting";

  function selectBox(box: CatalogBox) {
    setSelectedBox(box);
    setSelections({});
    setStatus("idle");
    setStatusMessage(null);
  }

  function addSnack(snackId: string) {
    if (picked >= target) return;
    setSelections((prev) => ({ ...prev, [snackId]: (prev[snackId] ?? 0) + 1 }));
  }

  function removeSnack(snackId: string) {
    setSelections((prev) => {
      const next = { ...prev };
      if (!next[snackId]) return prev;
      next[snackId] -= 1;
      if (next[snackId] <= 0) delete next[snackId];
      return next;
    });
  }

  const submitMutation = useMutation({
    mutationFn: () =>
      addBuildABoxToCart(
        selectedBox!.slug,
        Object.entries(selections).map(([snackId, quantity]) => ({ snackId, quantity }))
      ),
    onMutate: () => {
      setStatus("submitting");
      setStatusMessage(null);
    },
    onSuccess: () => {
      setStatus("success");
      setSelections({});
      queryClient.invalidateQueries({ queryKey: ["cart"] });
      showToast(`${selectedBox?.title ?? "Build-a-Box"} added to cart`);
    },
    onError: (error: Error) => {
      setStatus("error");
      setStatusMessage(error.message || "Something went wrong. Please try again.");
      showToast(error.message || "Couldn't add to cart", "error");
    },
  });

  if (boxesQuery.isPending || snacksQuery.isPending) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (boxesQuery.isError || snacksQuery.isError) {
    return (
      <View style={styles.centerState}>
        <Ionicons name="cloud-offline-outline" size={32} color={colors.mutedForeground} />
        <Text style={styles.emptyText}>Couldn't load Build-a-Box. Pull to refresh or try again shortly.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>Build Your Own Box</Text>
        <Text style={styles.subheading}>Pick a size, then choose exactly that many snacks.</Text>

        <View style={styles.sizeRow}>
          {buildABoxes.map((box) => {
            const active = selectedBox?.id === box.id;
            return (
              <Pressable
                key={box.id}
                onPress={() => selectBox(box)}
                style={({ pressed }) => [
                  styles.sizeCard,
                  active && styles.sizeCardActive,
                  pressed && styles.sizeCardPressed,
                ]}
              >
                <Text style={styles.sizeTitle}>{box.title}</Text>
                <Text style={styles.sizeSubtitle}>
                  {formatPriceCents(box.price_cents)} — {box.slot_count} items
                </Text>
              </Pressable>
            );
          })}
        </View>

        {selectedBox && (
          <>
            {status === "success" && <Text style={styles.successText}>Added to your cart.</Text>}
            {status === "error" && statusMessage && <Text style={styles.errorText}>{statusMessage}</Text>}

            {(snacksQuery.data ?? []).length === 0 ? (
              <View style={styles.centerState}>
                <Ionicons name="basket-outline" size={32} color={colors.mutedForeground} />
                <Text style={styles.emptyText}>
                  No snacks are eligible for Build-a-Box yet. Mark some as BYO-eligible in the admin dashboard.
                </Text>
              </View>
            ) : (
              <FlatList
                data={snacksQuery.data ?? []}
                keyExtractor={(snack) => snack.id}
                numColumns={2}
                scrollEnabled={false}
                columnWrapperStyle={styles.snackRow}
                contentContainerStyle={styles.snackGrid}
                renderItem={({ item: snack }) => (
                  <SnackPickerCard
                    snack={snack}
                    quantity={selections[snack.id] ?? 0}
                    disabled={picked >= target}
                    onAdd={() => addSnack(snack.id)}
                    onRemove={() => removeSnack(snack.id)}
                  />
                )}
              />
            )}
          </>
        )}
      </ScrollView>

      {selectedBox && (
        <View style={styles.stickyBar}>
          <Text style={styles.pickedText}>
            {picked} / {target} picked
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.submitButton,
              !canSubmit && styles.submitButtonDisabled,
              pressed && canSubmit && styles.submitButtonPressed,
            ]}
            disabled={!canSubmit}
            onPress={() => submitMutation.mutate()}
          >
            <Text style={styles.submitButtonText}>{status === "submitting" ? "Adding..." : "Add to Cart"}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function SnackPickerCard({
  snack,
  quantity,
  disabled,
  onAdd,
  onRemove,
}: {
  snack: ByoSnack;
  quantity: number;
  disabled: boolean;
  onAdd: () => void;
  onRemove: () => void;
}) {
  return (
    <View style={styles.snackCard}>
      <Text style={styles.snackName} numberOfLines={2}>
        {snack.name}
      </Text>
      <Text style={styles.snackPrice}>{formatPriceCents(snack.price_cents ?? 0)}</Text>
      <View style={styles.snackStepper}>
        <Pressable onPress={onRemove} disabled={quantity === 0} style={styles.stepperButton}>
          <Ionicons name="remove" size={16} color={quantity === 0 ? colors.mutedForeground : colors.foreground} />
        </Pressable>
        <Text style={styles.stepperValue}>{quantity}</Text>
        <Pressable onPress={onAdd} disabled={disabled} style={styles.stepperButton}>
          <Ionicons name="add" size={16} color={disabled ? colors.mutedForeground : colors.foreground} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing["4xl"],
  },
  heading: {
    ...typography.sizes["2xl"],
    fontFamily: typography.fontFamilyMedium,
    color: colors.foreground,
  },
  subheading: {
    ...typography.sizes.sm,
    color: colors.mutedForeground,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  sizeRow: {
    gap: spacing.sm,
  },
  sizeCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  sizeCardActive: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  sizeCardPressed: {
    opacity: 0.8,
  },
  sizeTitle: {
    ...typography.sizes.base,
    fontFamily: typography.fontFamilyMedium,
    color: colors.foreground,
  },
  sizeSubtitle: {
    ...typography.sizes.sm,
    color: colors.mutedForeground,
    marginTop: spacing.xs / 2,
  },
  successText: {
    ...typography.sizes.sm,
    fontFamily: typography.fontFamilyMedium,
    color: colors.primary,
    marginTop: spacing.md,
  },
  errorText: {
    ...typography.sizes.sm,
    color: colors.destructive,
    marginTop: spacing.md,
  },
  snackGrid: {
    marginTop: spacing.md,
  },
  snackRow: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  snackCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
  },
  snackName: {
    ...typography.sizes.sm,
    fontFamily: typography.fontFamilyMedium,
    color: colors.foreground,
  },
  snackPrice: {
    ...typography.sizes.xs,
    color: colors.mutedForeground,
    marginTop: spacing.xs / 2,
  },
  snackStepper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  stepperButton: {
    width: 28,
    height: 28,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperValue: {
    ...typography.sizes.sm,
    color: colors.foreground,
    minWidth: 16,
    textAlign: "center",
  },
  stickyBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  pickedText: {
    ...typography.sizes.base,
    fontFamily: typography.fontFamilyMedium,
    color: colors.foreground,
  },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.full,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  submitButtonDisabled: {
    backgroundColor: colors.muted,
  },
  submitButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  submitButtonText: {
    ...typography.sizes.sm,
    fontFamily: typography.fontFamilyMedium,
    color: colors.primaryForeground,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.background,
    paddingHorizontal: spacing["2xl"],
    paddingVertical: spacing["3xl"],
  },
  emptyText: {
    ...typography.sizes.sm,
    color: colors.mutedForeground,
    textAlign: "center",
  },
});
