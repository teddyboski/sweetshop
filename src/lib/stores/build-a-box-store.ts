import { create } from "zustand";
import type { SnackType, Flavor } from "@/lib/validations/cart";

export interface BuildABoxState {
  selectedSnackTypes: Set<SnackType>;
  selectedFlavors: Set<Flavor>;
  toggleSnackType: (type: SnackType) => void;
  toggleFlavor: (flavor: Flavor) => void;
  reset: () => void;
}

export const useBuildABoxStore = create<BuildABoxState>((set) => ({
  selectedSnackTypes: new Set(),
  selectedFlavors: new Set(),

  toggleSnackType: (type) =>
    set((state) => {
      const next = new Set(state.selectedSnackTypes);
      if (next.has(type)) { next.delete(type); } else { next.add(type); }
      return { selectedSnackTypes: next };
    }),

  toggleFlavor: (flavor) =>
    set((state) => {
      const next = new Set(state.selectedFlavors);
      if (next.has(flavor)) { next.delete(flavor); } else { next.add(flavor); }
      return { selectedFlavors: next };
    }),

  reset: () =>
    set({ selectedSnackTypes: new Set(), selectedFlavors: new Set() }),
}));
