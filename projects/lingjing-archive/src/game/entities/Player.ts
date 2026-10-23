import Phaser from "phaser";
import { pickFacing, type Facing } from "../utils/targetTile";
import { FarmerVisual, type FarmerAction } from "../systems/farmerVisual";

const SPEED = 160;

const K = Phaser.Input.Keyboard.KeyCodes;

/**
 * 玩家角色（纯表现层）。
 * 游戏规则（金币/时间/日期）不在此处理，仅负责移动、朝向与动画帧。
 * 输入：WASD + 方向键（同方向两组按键取“或”关系）。
 *
 * 注意：按键通过 scene.input.keyboard.addKey 注册，
 * 以保证 .down 状态由键盘插件持续更新（静态 addKey 不会被更新）。
 */
export class Player {
  readonly sprite: Phaser.Physics.Arcade.Sprite;
  private readonly scene: Phaser.Scene;
  private readonly keys = {
    up: [] as Phaser.Input.Keyboard.Key[],
    down: [] as Phaser.Input.Keyboard.Key[],
    left: [] as Phaser.Input.Keyboard.Key[],
    right: [] as Phaser.Input.Keyboard.Key[],
  };
  private frameTimer = 0;
  private facingDir: Facing = "down";
  private readonly visual: FarmerVisual;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    const kb = scene.input.keyboard!;
    this.keys.up = [K.W, K.UP].map((code) => kb.addKey(code, true));
    this.keys.down = [K.S, K.DOWN].map((code) => kb.addKey(code, true));
    this.keys.left = [K.A, K.LEFT].map((code) => kb.addKey(code, true));
    this.keys.right = [K.D, K.RIGHT].map((code) => kb.addKey(code, true));

    this.sprite = scene.physics.add.sprite(x, y, "player_0");
    this.sprite.setCollideWorldBounds(true);
    this.sprite.setDepth(10);
    this.visual = new FarmerVisual(scene, x, y + 16);
    if (this.visual.enabled) {
      this.sprite.setVisible(false);
      // ArcadePhysics registered its body-to-sprite sync before this scene's create.
      scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.syncVisual, this);
    }
  }

  get x(): number {
    return this.sprite.x;
  }

  get y(): number {
    return this.sprite.y;
  }

  /** 当前朝向（只读，外部不可改） */
  get facing(): Facing {
    return this.facingDir;
  }

  private anyDown(list: Phaser.Input.Keyboard.Key[]): boolean {
    return list.some((k) => k.isDown);
  }

  /** 每帧调用：驱动移动并切分走/站帧 */
  update(delta: number): void {
    const b = this.sprite.body as Phaser.Physics.Arcade.Body;
    b.setVelocity(0, 0);
    let moving = false;

    if (this.anyDown(this.keys.left)) {
      b.setVelocityX(-SPEED);
      moving = true;
    } else if (this.anyDown(this.keys.right)) {
      b.setVelocityX(SPEED);
      moving = true;
    }
    if (this.anyDown(this.keys.up)) {
      b.setVelocityY(-SPEED);
      moving = true;
    } else if (this.anyDown(this.keys.down)) {
      b.setVelocityY(SPEED);
      moving = true;
    }

    // T4 子阶段2：依据本帧 Body 最终速度更新朝向（速度已定、动画之前；无 return，必定执行）
    this.facingDir = pickFacing(b.velocity.x, b.velocity.y, this.facingDir);

    if (moving) {
      this.frameTimer += delta;
      if (this.frameTimer >= 160) this.frameTimer = 0;
      const key = this.frameTimer >= 80 ? "player_1" : "player_0";
      if (this.sprite.texture.key !== key) this.sprite.setTexture(key);
    } else if (this.sprite.texture.key !== "player_0") {
      this.sprite.setTexture("player_0");
      this.frameTimer = 0;
    }
    this.visual.update(this.facingDir, moving, delta);
  }

  private syncVisual(): void {
    this.visual.syncPosition(this.sprite.x, this.sprite.y + 16);
  }

  /** Action feedback changes only the display companion, never gameplay or its body. */
  playAction(action: FarmerAction): void { this.visual.playAction(action); }

  destroy(): void {
    this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.syncVisual, this);
    this.visual.destroy();
    const kb = this.scene.input.keyboard;
    for (const list of Object.values(this.keys)) {
      for (const k of list) kb?.removeKey(k);
    }
    this.sprite.destroy();
  }
}
