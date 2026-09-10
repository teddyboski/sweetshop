import { describe, it, expect, beforeEach } from "vitest";
import { useBuildABoxStore } from "@/lib/stores/build-a-box-store";

describe("useBuildABoxStore", () => {
  beforeEach(() => {
    useBuildABoxStore.getState().reset();
  });

  it("starts with empty selections", () => {
    const state = useBuildABoxStore.getState();
    expect(state.selectedSnackTypes.size).toBe(0);
    expect(state.selectedFlavors.size).toBe(0);
  });

  it("toggleSnackType adds a snack type", () => {
    useBuildABoxStore.getState().toggleSnackType("chips");
    expect(useBuildABoxStore.getState().selectedSnackTypes.has("chips")).toBe(true);
  });

  it("toggleSnackType removes a snack type if already selected", () => {
    useBuildABoxStore.getState().toggleSnackType("chips");
    useBuildABoxStore.getState().toggleSnackType("chips");
    expect(useBuildABoxStore.getState().selectedSnackTypes.has("chips")).toBe(false);
  });

  it("toggleFlavor adds a flavor", () => {
    useBuildABoxStore.getState().toggleFlavor("spicy");
    expect(useBuildABoxStore.getState().selectedFlavors.has("spicy")).toBe(true);
  });

  it("toggleFlavor removes a flavor if already selected", () => {
    useBuildABoxStore.getState().toggleFlavor("spicy");
    useBuildABoxStore.getState().toggleFlavor("spicy");
    expect(useBuildABoxStore.getState().selectedFlavors.has("spicy")).toBe(false);
  });

  it("reset clears all selections", () => {
    useBuildABoxStore.getState().toggleSnackType("chips");
    useBuildABoxStore.getState().toggleFlavor("sweet");
    useBuildABoxStore.getState().reset();
    expect(useBuildABoxStore.getState().selectedSnackTypes.size).toBe(0);
    expect(useBuildABoxStore.getState().selectedFlavors.size).toBe(0);
  });

  it("can select multiple snack types and flavors", () => {
    useBuildABoxStore.getState().toggleSnackType("chips");
    useBuildABoxStore.getState().toggleSnackType("candy");
    useBuildABoxStore.getState().toggleFlavor("sweet");
    useBuildABoxStore.getState().toggleFlavor("spicy");
    const state = useBuildABoxStore.getState();
    expect(state.selectedSnackTypes.size).toBe(2);
    expect(state.selectedFlavors.size).toBe(2);
    expect(state.selectedSnackTypes.has("chips")).toBe(true);
    expect(state.selectedSnackTypes.has("candy")).toBe(true);
  });
});
