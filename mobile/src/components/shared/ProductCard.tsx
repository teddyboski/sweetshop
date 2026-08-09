import { Pressable, StyleSheet, Text, View } from "react-native";
import { ProductImage } from "./ProductImage";
import { formatPriceCents } from "../../lib/utils/format";
import { colors, radii, spacing, typography } from "../../theme";

interface ProductCardProps {
  title: string;
  priceCents: number | null;
  imageUrl: string | null;
  subtitle?: string;
  onPress: () => void;
}

/** Shared card for both boxes and snacks - mirrors the web shop grid's Card usage. */
export function ProductCard({ title, priceCents, imageUrl, subtitle, onPress }: ProductCardProps) {
  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && styles.pressed]} onPress={onPress}>
      <ProductImage imageUrl={imageUrl} size={ImageSize} />
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.price}>
          {priceCents != null ? formatPriceCents(priceCents) : "—"}
          {subtitle ? <Text style={styles.subtitle}> {subtitle}</Text> : null}
        </Text>
      </View>
    </Pressable>
  );
}

const ImageSize = 150;

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
  },
  body: {
    padding: spacing.sm,
  },
  title: {
    ...typography.sizes.sm,
    fontFamily: typography.fontFamilyMedium,
    color: colors.foreground,
  },
  price: {
    ...typography.sizes.sm,
    color: colors.mutedForeground,
    marginTop: spacing.xs,
  },
  subtitle: {
    ...typography.sizes.xs,
    color: colors.mutedForeground,
  },
});
