import { create } from "zustand";

export interface BuildABoxState {
  slotCount: number;
  selections: Record<string, number>;
  totalPicked: () => number;
  addSnack: (snackId: string) => void;
  removeSnack: (snackId: string) => void;
  setSlotCount: (slotCount: number) => void;
  reset: () => void;
}

export const useBuildABoxStore = create<BuildABoxState>((set, get) => ({
  slotCount: 0,
  selections: {},

  totalPicked: () => Object.values(get().selections).reduce((sum, qty) => sum + qty, 0),

  addSnack: (snackId) => {
    const { selections, slotCount } = get();
    const currentTotal = Object.values(selections).reduce((sum, qty) => sum + qty, 0);
    if (currentTotal >= slotCount) return;

    set({
      selections: {
        ...selections,
        [snackId]: (selections[snackId] ?? 0) + 1,
      },
    });
  },

  removeSnack: (snackId) => {
    const { selections } = get();
    const current = selections[snackId] ?? 0;
    if (current <= 1) {
      const rest = { ...selections };
      delete rest[snackId];
      set({ selections: rest });
      return;
    }
    set({ selections: { ...selections, [snackId]: current - 1 } });
  },

  setSlotCount: (slotCount) => set({ slotCount }),

  reset: () => set({ selections: {} }),
}));
