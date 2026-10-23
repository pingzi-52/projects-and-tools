import { describe, expect, it } from "vitest";
import { selectExplorationTarget } from "../src/ui/explorationTarget";
import type { ForageNode } from "../src/data/maps/explorationMaps";

const node = (id: string, col: number): ForageNode => ({ id, row: 2, col, itemId: "branch" });
const player = { x: 80, y: 80 };
const distantResident = { x: 500, y: 500 };

describe("exploration interaction selection", () => {
  it("uses the same resident-first priority as E, including exactly 64px", () => {
    expect(selectExplorationTarget(player, { x: 144, y: 80 }, [node("a", 2)], [])).toEqual({ kind: "resident" });
    expect(selectExplorationTarget(player, { x: 144.01, y: 80 }, [node("a", 2)], [])).toEqual({ kind: "node", node: node("a", 2), picked: false });
  });

  it("chooses an available resource over a closer depleted resource", () => {
    const nodes = [node("old", 2), node("fresh", 3)];
    expect(selectExplorationTarget(player, distantResident, nodes, ["old"]))
      .toEqual({ kind: "node", node: nodes[1], picked: false });
  });

  it("chooses the nearest available resource and breaks equal distances by source order", () => {
    const nodes = [node("left", 1), node("right", 3), node("center", 2)];
    expect(selectExplorationTarget(player, distantResident, nodes, [])).toEqual({ kind: "node", node: nodes[2], picked: false });
    expect(selectExplorationTarget(player, distantResident, nodes.slice(0, 2), []))
      .toEqual({ kind: "node", node: nodes[0], picked: false });
  });

  it("keeps the 44px gather range and allows inspection of a depleted point", () => {
    const nodes = [node("a", 2)];
    expect(selectExplorationTarget({ x: 124, y: 80 }, distantResident, nodes, ["a"]))
      .toEqual({ kind: "node", node: nodes[0], picked: true });
    expect(selectExplorationTarget({ x: 124.01, y: 80 }, distantResident, nodes, [])).toBeNull();
  });

  it("returns no target away from interactions or with nonfinite player coordinates", () => {
    expect(selectExplorationTarget(player, distantResident, [], [])).toBeNull();
    for (const value of [NaN, Infinity, -Infinity]) {
      expect(selectExplorationTarget({ x: value, y: 80 }, player, [node("a", 2)], [])).toBeNull();
      expect(selectExplorationTarget({ x: 80, y: value }, player, [node("a", 2)], [])).toBeNull();
    }
  });

  it("never reorders map nodes or changes daily depletion", () => {
    const nodes = [node("far", 3), node("near", 2)], picked = ["near"];
    const before = JSON.stringify({ nodes, picked });
    selectExplorationTarget(player, distantResident, nodes, picked);
    expect(JSON.stringify({ nodes, picked })).toBe(before);
  });
});
