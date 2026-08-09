import { Image, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii } from "../../theme";

interface ProductImageProps {
  imageUrl: string | null | undefined;
  size?: number;
  radius?: keyof typeof radii;
}

/** Mirrors src/components/shared/product-image.tsx's empty-state fallback. */
export function ProductImage({ imageUrl, size = 160, radius = "md" }: ProductImageProps) {
  const style = { width: size, height: size, borderRadius: radii[radius] };

  if (!imageUrl) {
    return (
      <View style={[styles.fallback, style]}>
        <Ionicons name="image-outline" size={size * 0.25} color={colors.mutedForeground} />
      </View>
    );
  }

  return <Image source={{ uri: imageUrl }} style={style} resizeMode="cover" />;
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
});
