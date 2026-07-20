import { describe, it, expect, beforeEach } from "vitest";
import { useBuildABoxStore } from "@/lib/stores/build-a-box-store";

describe("useBuildABoxStore", () => {
  beforeEach(() => {
    useBuildABoxStore.setState({ slotCount: 0, selections: {} });
  });

  it("starts empty", () => {
    expect(useBuildABoxStore.getState().selections).toEqual({});
    expect(useBuildABoxStore.getState().totalPicked()).toBe(0);
  });

  it("setSlotCount sets the target slot count", () => {
    useBuildABoxStore.getState().setSlotCount(8);
    expect(useBuildABoxStore.getState().slotCount).toBe(8);
  });

  it("addSnack increments a snack's quantity", () => {
    useBuildABoxStore.getState().setSlotCount(8);
    useBuildABoxStore.getState().addSnack("snack-1");
    useBuildABoxStore.getState().addSnack("snack-1");
    expect(useBuildABoxStore.getState().selections["snack-1"]).toBe(2);
    expect(useBuildABoxStore.getState().totalPicked()).toBe(2);
  });

  it("addSnack refuses once slotCount is reached", () => {
    useBuildABoxStore.getState().setSlotCount(2);
    useBuildABoxStore.getState().addSnack("snack-1");
    useBuildABoxStore.getState().addSnack("snack-2");
    useBuildABoxStore.getState().addSnack("snack-3");

    expect(useBuildABoxStore.getState().totalPicked()).toBe(2);
    expect(useBuildABoxStore.getState().selections["snack-3"]).toBeUndefined();
  });

  it("removeSnack decrements, then removes the key at zero", () => {
    useBuildABoxStore.getState().setSlotCount(8);
    useBuildABoxStore.getState().addSnack("snack-1");
    useBuildABoxStore.getState().addSnack("snack-1");
    useBuildABoxStore.getState().removeSnack("snack-1");
    expect(useBuildABoxStore.getState().selections["snack-1"]).toBe(1);

    useBuildABoxStore.getState().removeSnack("snack-1");
    expect(useBuildABoxStore.getState().selections["snack-1"]).toBeUndefined();
  });

  it("reset clears all selections but keeps slotCount", () => {
    useBuildABoxStore.getState().setSlotCount(8);
    useBuildABoxStore.getState().addSnack("snack-1");
    useBuildABoxStore.getState().reset();

    expect(useBuildABoxStore.getState().selections).toEqual({});
    expect(useBuildABoxStore.getState().slotCount).toBe(8);
  });
});
