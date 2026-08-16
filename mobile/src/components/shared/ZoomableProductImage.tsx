import { useState } from "react";
import { Dimensions, Image, Modal, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii } from "../../theme";
import { ProductImage } from "./ProductImage";

interface ZoomableProductImageProps {
  imageUrl: string | null | undefined;
  size?: number;
  radius?: keyof typeof radii;
}

/**
 * Milestone 23: wraps ProductImage for detail-screen hero images only
 * (grid cards already handle taps as navigation to the detail screen - a
 * zoom there would fight that). Tap opens a full-screen Modal with a
 * larger version of the same image; tap anywhere to dismiss. Deliberately
 * no pinch/pan - Ted chose the simpler option that ships via an OTA
 * update over adding a new native gesture library.
 */
export function ZoomableProductImage({ imageUrl, size = 280, radius = "xl" }: ZoomableProductImageProps) {
  const [open, setOpen] = useState(false);

  if (!imageUrl) {
    return <ProductImage imageUrl={imageUrl} size={size} radius={radius} />;
  }

  const screenWidth = Dimensions.get("window").width;

  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityLabel="View larger image" accessibilityRole="imagebutton">
        <ProductImage imageUrl={imageUrl} size={size} radius={radius} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Image
            source={{ uri: imageUrl }}
            style={{ width: screenWidth - 48, height: screenWidth - 48 }}
            resizeMode="contain"
          />
          <View style={styles.closeButton}>
            <Ionicons name="close" size={22} color={colors.background} />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeButton: {
    position: "absolute",
    top: 48,
    right: 24,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
});
