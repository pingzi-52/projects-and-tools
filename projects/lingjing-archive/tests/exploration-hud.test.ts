import { describe, expect, it } from "vitest";
import type { QuestGuidance, GuidanceStatus } from "../src/ui/questGuidance";
import type { ExplorationMap } from "../src/data/maps/explorationMaps";
import { compactQuestText, townFrontageHint } from "../src/ui/explorationHud";

function guidance(status: GuidanceStatus, area: QuestGuidance["area"] = "forest"): QuestGuidance {
  return {
    area, status, title: "森林的馈赠", resident: "岚", requirements: [],
    progress: "野蘑菇 1/3", nextStep: "这是很长的完整引导，不应挤在探索角落里。",
  };
}

describe("compact exploration guidance", () => {
  it.each([
    ["available", "找岚接取"],
    ["active", "野蘑菇 1/3"],
    ["ready", "材料齐了 · 找岚交付"],
    ["completed", "委托已完成"],
  ] as const)("shows two concise lines for %s", (status, expected) => {
    const text = compactQuestText(guidance(status), 2, 9);
    expect(text).toBe(`森林的馈赠 · L 手记\n${expected} · 已采 2/9`);
    expect(text.split("\n")).toHaveLength(2);
    expect(text).not.toContain(guidance(status).nextStep);
  });

  it.each(["town", "farm"] as const)("omits forest collection counts in %s", area => {
    const text = compactQuestText(guidance("active", area), 2, 9);
    expect(text).toBe("森林的馈赠 · L 手记\n野蘑菇 1/3");
    expect(text).not.toContain("已采");
  });

  it.each([
    [-5, 9, "0/9"], [100, 9, "9/9"], [4.9, 9.8, "4/9"],
    [4, -1, "0/0"], [Number.NaN, 9, "0/9"],
    [Number.POSITIVE_INFINITY, 9, "0/9"], [4, Number.NaN, "0/0"],
  ])("normalizes collected %s and total %s", (picked, total, expected) => {
    expect(compactQuestText(guidance("active"), picked, total)).toContain(`已采 ${expected}`);
  });
});

const buildings: ExplorationMap["buildings"] = [
  { row: 6, col: 5, width: 6, height: 3, label: "木匠工坊" },
  { row: 6, col: 20, width: 6, height: 3, label: "林缘会馆" },
];
const workshop = "木匠工坊 · 阿榆在广场 · 室内暂未开放";
const hall = "林缘会馆 · 室内暂未开放";

describe("town building frontage hints", () => {
  it("explains the workshop and the carpenter's actual outdoor location", () => {
    expect(townFrontageHint({ x: 256, y: 320 }, buildings)).toBe(workshop);
    expect(townFrontageHint({ x: 736, y: 320 }, buildings)).toBe(hall);
  });

  it.each([[160, 288], [352, 288], [160, 352], [352, 352]])(
    "includes the frontage boundary x=%s y=%s", (x, y) => {
      expect(townFrontageHint({ x, y }, buildings)).toBe(workshop);
    },
  );

  it.each([[159.99, 320], [352.01, 320], [256, 287.99], [256, 352.01], [256, 200], [400, 320]])(
    "does not show a hint outside the frontage x=%s y=%s", (x, y) => {
      expect(townFrontageHint({ x, y }, buildings)).toBeNull();
    },
  );

  it.each([
    [Number.NaN, 320], [Number.POSITIVE_INFINITY, 320], [256, Number.NEGATIVE_INFINITY],
  ])("ignores non-finite player coordinates x=%s y=%s", (x, y) => {
    expect(townFrontageHint({ x, y }, buildings)).toBeNull();
  });

  it("does not advertise an entrance for unknown buildings or an empty map", () => {
    expect(townFrontageHint({ x: 256, y: 320 }, [{ ...buildings[0], label: "仓库" }])).toBeNull();
    expect(townFrontageHint({ x: 256, y: 320 }, [])).toBeNull();
  });
});
