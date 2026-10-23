import type Phaser from "phaser";
import { PausePanel, node, FEEDBACK } from "./PausePanel";
import { getGameSession } from "../game/systems/GameSession";
import { ItemIconCache } from "../game/systems/itemVisual";
import { FISHES, FISHING_COST, type FishId } from "../data/fishing";
import { getFarmAudio } from "../game/systems/farmAudio";
import { FishingFeedback, fishingCountdown, fishingEscapeHelp } from "./fishingFeedback";
import { getFishingQuestGuidance } from "./fishingQuestGuidance";
import "../styles/fishing.css";

const FAILURES: Record<string,string> = {
  TOO_TIRED: "体力不足4点，先回屋休息或吃一份菌菇餐。", INVENTORY_FULL: "背包已满，先整理背包再来垂钓。",
  SAVE_FAILED: "保存失败，鱼获和体力已撤回。请按“收好鱼获”重试。", FISHING_ACTIVE: "先完成这一次垂钓。", NO_CATCH: "这次还没有鱼获。",
};

/** The existing scene update drives the round; this panel creates no timers. */
export class FishingPanel extends PausePanel {
  private status!: HTMLElement;
  private help!: HTMLElement;
  private score!: HTMLElement;
  private meter!: HTMLElement;
  private cursor!: HTMLElement;
  private water!: HTMLElement;
  private fish!: HTMLImageElement;
  private action!: HTMLButtonElement;
  private feedback!: HTMLElement;
  private signal!: HTMLElement;
  private countdown!: HTMLElement;
  private progressDots!: HTMLElement;
  private quest!: HTMLElement;
  private questMessage!: HTMLElement;
  private lastQuestKey="";
  private readonly response = new FishingFeedback();
  private receipt: FishId | null = null;
  private shownFish: FishId | null = null;
  private lastAnnouncement = "";
  private readonly icons: ItemIconCache;
  private readonly onFishingKey = (event: KeyboardEvent): void => {
    if (!this.isOpen || document.hidden || (event.code !== "KeyF" && event.code !== "Space")) return;
    const target = event.target instanceof Element ? event.target.closest("button") : null;
    if (event.code === "Space" && target && target.dataset.action !== "fishing-action") return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (!event.repeat) this.act();
  };
  private readonly onFishingVisibility = (): void => {
    if (this.isOpen && document.hidden) {
      getGameSession().fishing.update(0, true);
      this.response.update(0, true);
    }
  };

  constructor(scene: Phaser.Scene) {
    super(scene,"池畔垂钓", ""); this.icons=new ItemIconCache(scene);
    document.addEventListener("keydown",this.onFishingKey,true);
    document.addEventListener("visibilitychange",this.onFishingVisibility);
  }

  open(): void {
    if (this.isOpen) return;
    if (!this.begin()) return;
    this.receipt=null;this.shownFish=null;this.lastAnnouncement="";this.lastQuestKey="";this.response.reset();
    const panel=this.panel("池畔垂钓"); panel.classList.add("fishing-panel");
    this.overlay!.classList.add("fishing-overlay");
    this.water=node("div","fishing-water");this.water.setAttribute("aria-hidden","true");
    this.water.append(node("span","fishing-ripple ripple-one"),node("span","fishing-ripple ripple-two"),node("span","fishing-bobber"));
    this.fish=node("img","fishing-catch");this.fish.alt="";this.fish.hidden=true;this.water.append(this.fish);
    this.status=node("h3","fishing-status");this.status.setAttribute("role","status");this.status.setAttribute("aria-live","polite");
    this.help=node("p","fishing-help");
    this.meter=node("div","fishing-meter");this.meter.setAttribute("role","meter");this.meter.setAttribute("aria-label","鱼线指针，绿区22至78");this.meter.setAttribute("aria-valuemin","0");this.meter.setAttribute("aria-valuemax","100");
    this.meter.append(node("span","fishing-safe"));this.cursor=node("span","fishing-cursor");this.meter.append(this.cursor);
    this.score=node("p","fishing-score");
    this.progressDots=node("div","fishing-progress");this.progressDots.setAttribute("aria-hidden","true");
    for(let index=0;index<3;index++) this.progressDots.append(node("span","fishing-progress-step",String(index+1)));
    this.countdown=node("p","fishing-countdown");this.countdown.setAttribute("aria-live","off");
    this.signal=node("p","fishing-signal");this.signal.setAttribute("role","status");this.signal.setAttribute("aria-live","polite");
    this.feedback=node("p","fishing-feedback");this.feedback.setAttribute("role","status");
    this.quest=node("section","fishing-quest");this.quest.setAttribute("aria-label","池塘第一尾委托");
    this.questMessage=node("p","fishing-quest-message");this.questMessage.setAttribute("role","status");
    this.action=this.button("等待咬钩","fishing-action",()=>this.act());
    panel.append(node("p","fishing-cost",`岸边备有鱼竿 · 成功收好鱼获消耗${FISHING_COST}体力 · 取消/失败不扣体力`),this.water,this.status,this.help,this.meter,this.progressDots,this.score,this.countdown,this.signal,this.feedback,this.action,this.quest,this.questMessage,node("small","fishing-keys","F / 空格 操作 · 也可点击按钮 · Esc 放下鱼竿"));
    this.show(panel);this.render();this.action.focus();getFarmAudio().play("confirm");
  }

  update(delta:number):void {
    if (!this.isOpen) return;
    getGameSession().fishing.update(delta,document.hidden);
    this.response.update(delta,document.hidden);
    if (!document.hidden) this.render();
  }

  private act():void {
    if (!this.isOpen || document.hidden) return;
    const session=getGameSession(), state=session.fishing.state;
    if (this.receipt || state.phase === "escaped" || state.phase === "idle") {
      const result=session.castFishing();
      if(!result.ok){this.feedback.textContent=FAILURES[result.reason] ?? "暂时无法下竿。";return;}
      this.receipt=null;this.feedback.textContent="";this.response.reset();getFarmAudio().play("confirm");
      this.questMessage.textContent="";
    } else if (state.phase === "caught") {
      const result=session.landFish();
      if(result.ok) {this.receipt=result.value.itemId as FishId;this.feedback.textContent="已放进随身背包并保存 · 可存木箱或在集市出售";getFarmAudio().play("confirm");}
      else {this.feedback.textContent=FAILURES[result.reason] ?? "鱼获未能保存，请重试。";getFarmAudio().play("error");}
    } else {
      session.fishing.tap();
    }
    this.render();
  }

  private render():void {
    const state=getGameSession().fishing.state;
    const phase=this.receipt ? "landed" : state.phase;
    this.water.dataset.phase=phase;
    if(this.water.parentElement)this.water.parentElement.dataset.phase=phase;
    const texts: Record<string,[string,string,string]> = {
      waiting:["浮标轻晃，等一等…","等浮标下沉、出现咬钩提示再提竿。","提前收竿"],
      bite:["咬钩了！快提竿！","按 F、空格或点按钮提竿，别让鱼跑掉。","提竿！"],
      reeling:["让鱼线保持松紧有度", "指针在绿区时收线，成功3次；失误5次或超时鱼会跑。", "收线"],
      caught:["鱼上岸了！", "收好鱼获后才扣体力并保存。", "收好鱼获"],
      escaped:["鱼儿游走了", fishingEscapeHelp(state.escapeReason), "再试一次"],
      landed:["鱼获已经收好", "慢慢来，下一竿也许会有不同收获。", "再钓一条"],
      idle:["在池边坐一会儿", "准备好了再下竿；也可以先看看岸边的委托。", "下竿 · 开始垂钓"],
    };
    const [title,help,label]=texts[phase];
    const fishId=this.receipt ?? state.fishId;
    const fish=FISHES.find(f=>f.id===fishId);
    const announcement=fish && (phase==="caught"||phase==="landed") ? `${title} · ${fish.name} × 1` : title;
    const score=phase==="reeling" ? `收线 ${state.progress}/3 · 失误 ${state.misses}/5（再失误 ${5-state.misses} 次会逃脱） · ${state.inZone ? "绿区内 · 现在收线" : "等指针进入绿区"}`
      : fish ? `可出售 ${fish.sellPrice} 金 · ${phase==="landed"?"已保存":"尚未入袋"}` : phase==="waiting" ? "静候水中的动静" : "";
    // Announce phase changes once; the countdown and moving cursor are not live regions.
    if(announcement!==this.lastAnnouncement){this.status.textContent=announcement;this.lastAnnouncement=announcement;}
    if(this.help.textContent!==help)this.help.textContent=help;
    if(this.score.textContent!==score)this.score.textContent=score;
    if(this.action.textContent!==label)this.action.textContent=label;
    const event=this.response.observe(state);
    if(event)getFarmAudio().play(event.cue);
    const signal=this.response.current;
    const message=signal?.message ?? "";
    if(this.signal.textContent!==message)this.signal.textContent=message;
    this.signal.dataset.kind=signal?.kind ?? "";
    this.water.dataset.feedback=signal?.kind ?? "";
    this.water.style.setProperty("--fishing-pulse",String(this.response.pulse));
    const countdown=fishingCountdown(state);
    if(this.countdown.textContent!==countdown)this.countdown.textContent=countdown;
    this.countdown.hidden=!countdown;
    this.progressDots.hidden=phase!=="reeling";
    [...this.progressDots.children].forEach((dot,index)=>dot.classList.toggle("is-complete",index<state.progress));
    this.meter.hidden=phase!=="reeling";
    this.cursor.style.left=`${state.cursor*100}%`;
    this.meter.setAttribute("aria-valuenow",String(Math.round(state.cursor*100)));
    this.meter.setAttribute("aria-valuetext",state.inZone?"绿区内，可以收线":"绿区外，请等待");
    this.meter.classList.toggle("is-safe",state.inZone);
    this.fish.hidden=!fish;
    if(fish && this.shownFish!==fish.id){this.fish.src=this.icons.src(fish.id);this.fish.alt=fish.name;this.shownFish=fish.id;}
    this.quest.hidden=!["idle","escaped","landed"].includes(phase);
    this.questMessage.hidden=this.quest.hidden;
    if(!this.quest.hidden)this.renderQuest();
    this.quest.querySelectorAll("button").forEach(button=>{button.disabled=Boolean(this.quest.hidden);});
  }

  private renderQuest():void {
    const session=getGameSession(),guide=getFishingQuestGuidance(session),key=JSON.stringify(guide);
    if(key===this.lastQuestKey)return;
    this.lastQuestKey=key;
    const hadFocus=this.quest.contains(document.activeElement);
    this.quest.replaceChildren(node("h4","",`${guide.title} · ${guide.status==="completed"?"已完成":`一次性奖励 ${guide.reward} 金`}`));
    const controls=node("div","fishing-quest-actions");
    this.quest.append(node("p","",guide.status==="ready" ? `选择一尾鱼交付，扣除该鱼1尾，获得${guide.reward}金。` : guide.nextStep));
    const run=(fishId?:FishId):void=>{
      const result=fishId ? session.completeFishingQuest(fishId) : session.acceptFishingQuest();
      this.questMessage.textContent=result.ok ? fishId?`交付成功 · 获得 ${guide.reward} 金并保存` : "委托已接取并保存。已有的鱼也可以交付。" : FEEDBACK[result.reason] ?? "委托操作未能完成，请重试。";
      getFarmAudio().play(result.ok?fishId?"coin":"confirm":"error");
      if(result.ok && fishId){this.receipt=null;this.feedback.textContent="";}
      this.render();
    };
    if(guide.status==="available")controls.append(this.button("接取委托","fish-quest-accept",()=>run()));
    for(const fish of guide.choices)controls.append(this.button(`交付${fish.name} × 1（随身${fish.have}）`,`fish-quest-deliver-${fish.id}`,()=>run(fish.id)));
    if(guide.status!=="completed")this.quest.append(node("small","","任意鱼1尾 · 背包已有鱼也可交付 · 交付会扣除所选鱼"));
    this.quest.append(controls);
    if(hadFocus)(controls.querySelector("button") ?? this.action).focus();
  }

  override close():void {
    if(!this.isOpen)return;
    getGameSession().cancelFishing();this.receipt=null;this.response.reset();super.close();
  }
  override destroy():void {
    super.destroy();document.removeEventListener("keydown",this.onFishingKey,true);document.removeEventListener("visibilitychange",this.onFishingVisibility);
  }
}
