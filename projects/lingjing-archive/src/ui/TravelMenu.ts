import type Phaser from "phaser";
import { FORAGE_NODES } from "../data/exploration";
import type { AreaId } from "../data/maps/areaConnections";
import { getGameSession } from "../game/systems/GameSession";
import { PausePanel, node } from "./PausePanel";
import { getQuestGuidance, type GuidanceStatus } from "./questGuidance";
import { getFishingQuestGuidance } from "./fishingQuestGuidance";
import "../styles/quest-journal.css";

const AREAS = [
  { id: "forest", name: "林缘森林" },
  { id: "farm", name: "林缘农场" },
  { id: "town", name: "溪桥镇" },
] as const;
const STATUS: Record<GuidanceStatus, string> = {
  available: "尚未接取", active: "进行中", ready: "材料齐了", completed: "已完成",
};

/** Read-only route and quest journal. All quest actions remain with the residents. */
export class TravelMenu extends PausePanel {
  constructor(scene: Phaser.Scene) { super(scene, "区域与委托", "KeyL"); }

  open(): void {
    if (!this.begin()) return;
    const session = getGameSession(), currentArea = this.scene.sys.settings.key;
    const panel = this.panel("区域手记 · 委托");
    panel.classList.add("quest-journal");
    panel.style.overflowY = "hidden";

    const body = node("div", "farm-menu-body quest-journal-body");
    const route = node("div", "quest-journal-route");
    route.setAttribute("aria-label", "区域方位：森林在农场西侧，小镇在农场东侧");
    AREAS.forEach((area, index) => {
      if (index) route.append(node("span", "quest-journal-arrow", index === 1 ? "←" : "→"));
      const label = node("span", "quest-journal-area", area.name);
      if (currentArea === area.id) {
        label.classList.add("is-current");
        label.append(node("small", "", "你在这里"));
      }
      route.append(label);
    });
    body.append(route);
    if (currentArea === "home") {
      body.append(node("p", "quest-journal-home", "你在林缘小屋 · 从下方门口出屋后，沿农场左右道路步行。"));
    }

    for (const areaId of ["farm", "forest", "town"] as const satisfies readonly AreaId[]) {
      const quest = getQuestGuidance(session, areaId);
      const card = node("article", `quest-journal-card is-${quest.status}`);
      card.dataset.questArea = areaId;
      const heading = node("div", "quest-journal-card-heading");
      const title = node("h3", "", quest.title);
      const place = AREAS.find(area => area.id === quest.area)!;
      heading.append(title, node("span", "quest-journal-resident", `${place.name} · ${quest.resident}`),
        node("span", "quest-journal-badge", STATUS[quest.status]));
      card.append(heading);

      if (quest.requirements.length && quest.status !== "completed") {
        const materials = node("div", "quest-journal-materials");
        materials.setAttribute("aria-label", "随身材料与交付数量");
        materials.append(node("span", "", "随身"));
        for (const requirement of quest.requirements) {
          materials.append(node("span", requirement.have >= requirement.need ? "is-enough" : "",
            `${requirement.name} ${requirement.have}/${requirement.need}`));
        }
        card.append(materials);
      } else {
        card.append(node("p", "quest-journal-progress", quest.status === "completed" ? "委托已完成 · 报酬已领取" : quest.progress));
      }
      card.append(node("p", "quest-journal-next", quest.nextStep));
      if (areaId === "farm" && quest.status !== "completed") {
        card.append(node("p", "quest-journal-forage", "田边未见禾木时，可在农场按 Q 查看便笺。"));
      }
      if (areaId === "forest") {
        card.append(node("p", "quest-journal-forage",
          `今日已采 ${session.exploration.state.picked.length}/${FORAGE_NODES.length} 处 · 睡一觉后恢复`));
      }
      body.append(card);
    }
    const fishing=getFishingQuestGuidance(session);
    const fishingCard=node("article",`quest-journal-card is-${fishing.status}`);
    fishingCard.dataset.questArea="pond";
    const heading=node("div","quest-journal-card-heading");
    heading.append(node("h3","",fishing.title),node("span","quest-journal-resident","农场东南 · 池边便笺"),node("span","quest-journal-badge",STATUS[fishing.status]));
    fishingCard.append(heading,node("p","quest-journal-next",fishing.nextStep));
    body.append(fishingCard);
    panel.append(body, node("p", "quest-journal-footer", "材料只计随身，木箱物品先取出 · L / Esc 收起"));
    this.show(panel);
  }
}
