import { useMemo } from "react";
import {
  AbsoluteFill,
  CalculateMetadataFunction,
  Composition,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { ThreeCanvas } from "@remotion/three";
import {
  CameraRig,
  Core,
  Cursor,
  Floor,
  Lights,
  Orb,
  Particles,
  cameraPosition,
  focusPoint,
} from "./scene";

type Props = {
  /** Accent colour used for the HUD and the headline. */
  accent: string;
  /** Duration of the finished video, in seconds. */
  seconds: number;
};

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// ---------------------------------------------------------------------------
// Choreography.
//
// `target` is the index the pointer clicks: 0-3 are the orbiting octahedra,
// 4 is the central core. The pointer does not travel to a hard-coded x/y —
// it travels to wherever that object *is* on the frame it gets clicked, so
// the reticle always lands on the object instead of beside it.
// ---------------------------------------------------------------------------
export const CLICKS = [
  { at: 1.9, target: 0, label: "ORBIT" },
  { at: 4.1, target: 1, label: "ARRAY" },
  { at: 6.2, target: 4, label: "CORE" },
  { at: 8.4, target: 2, label: "FIELD" },
  { at: 10.5, target: 3, label: "LOCK" },
];

const ACCENTS: Record<number, string> = {
  0: "#ff2e97",
  1: "#ffd166",
  2: "#7c4dff",
  3: "#00ffa3",
  4: "#00e5ff",
};

const LAST_CLICK = CLICKS[CLICKS.length - 1].at;

// Camera path shared by the renderer and by the pointer maths.
const cameraAt = (t: number) => {
  const yaw = -0.5 + t * 0.13 + Math.sin(t * 0.45) * 0.07;
  const pitch = interpolate(
    t,
    [0, 3.2, 6.4, 9.6, 13],
    [1.42, 1.24, 1.36, 1.18, 1.3],
    { ...clamp, easing: Easing.inOut(Easing.cubic) },
  );
  const radius = interpolate(t, [0, 6.5, 13], [16.5, 14.6, 12.8], clamp);
  return { yaw, pitch, radius };
};

const mono = {
  fontFamily: '"Courier New", ui-monospace, monospace',
  letterSpacing: 2,
} as const;

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
const Corner = ({ accent }: { accent: string }) => (
  <>
    {[
      { top: 34, left: 34, borderTopWidth: 2, borderLeftWidth: 2 },
      { top: 34, right: 34, borderTopWidth: 2, borderRightWidth: 2 },
      { bottom: 34, left: 34, borderBottomWidth: 2, borderLeftWidth: 2 },
      { bottom: 34, right: 34, borderBottomWidth: 2, borderRightWidth: 2 },
    ].map((s, i) => (
      <div
        key={i}
        style={{
          position: "absolute",
          width: 38,
          height: 38,
          borderColor: accent,
          borderStyle: "solid",
          borderTopWidth: 0,
          borderRightWidth: 0,
          borderBottomWidth: 0,
          borderLeftWidth: 0,
          opacity: 0.45,
          ...s,
        }}
      />
    ))}
  </>
);

const HUD = ({
  t,
  accent,
  active,
}: {
  t: number;
  accent: string;
  active: number;
}) => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <Corner accent={accent} />

      {/* scan line sweeping down the frame */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          height: 2,
          background: "#ffffff",
          opacity: 0.1,
          translate: interpolate(t % 3.4, [0, 3.4], ["0px", "1080px"], clamp),
        }}
      />

      {/* click log */}
      <div
        style={{
          position: "absolute",
          left: 78,
          top: 96,
          fontSize: 17,
          color: accent,
          ...mono,
        }}
      >
        {CLICKS.map((c, i) => {
          const shown = interpolate(t, [c.at - 0.4, c.at], [0, 1], clamp);
          return (
            <div
              key={i}
              style={{
                opacity: shown * 0.95,
                translate: active === i ? "14px" : "0px",
              }}
            >
              {String(i).padStart(2, "0")} · {c.at.toFixed(1)}s ·{" "}
              {c.label}
              {"    "}
              {active === i ? "▸" : ""}
            </div>
          );
        })}
      </div>

      {/* progress readout */}
      <div
        style={{
          position: "absolute",
          right: 78,
          top: 96,
          textAlign: "right",
          fontSize: 15,
          color: "#ffffff",
          ...mono,
        }}
      >
        <div style={{ opacity: 0.45 }}>CLICK STREAM</div>
        <div style={{ marginTop: 8, opacity: 0.85 }}>
          {String(
            Math.round(interpolate(t, [0, LAST_CLICK + 2], [0, 100], clamp)),
          ).padStart(3, "0")}
          % · {Math.round(t * fps)}F · 1920×1080
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------
// 3D scene
// ---------------------------------------------------------------------------
const Scene = ({
  cursor,
  hovered,
  hitAges,
  pressAge,
  t,
  camera,
}: {
  cursor: [number, number, number];
  hovered: number | null;
  hitAges: number[];
  pressAge: number;
  t: number;
  camera: { yaw: number; pitch: number; radius: number };
}) => (
  <>
    <color attach="background" args={["#03040c"]} />
    <fog attach="fog" args={["#03040c", 18, 44]} />
    <CameraRig yaw={camera.yaw} pitch={camera.pitch} radius={camera.radius} />

    <Lights
      t={t}
      cursorX={cursor[0]}
      cursorY={cursor[1]}
      cursorZ={cursor[2]}
    />
    <Particles
      count={800}
      cursorX={cursor[0]}
      cursorY={cursor[1]}
      cursorZ={cursor[2]}
      pressAge={pressAge}
      t={t}
    />
    <Core t={t} hover={hovered === 4 ? 1 : 0} hitAge={hitAges[4] ?? 0} />
    {[0, 1, 2, 3].map((i) => (
      <Orb
        key={i}
        index={i}
        t={t}
        hitAge={hitAges[i] ?? 0}
        hovered={hovered === i}
      />
    ))}
    <Floor pressAge={pressAge} />
    <Cursor
      x={cursor[0]}
      y={cursor[1]}
      z={cursor[2]}
      pressing={pressAge}
      color="#00e5ff"
      t={t}
    />
  </>
);

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------
export const PointerDemoScene: React.FC<Props> = ({ accent }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;

  const camera = useMemo(() => cameraAt(t), [t]);

  // Pointer position: travel from the previous click towards the *live*
  // position of the next target, so it arrives exactly on it.
  const cursor = useMemo(() => {
    const toVec = (
      target: number,
      at: number,
    ): [number, number, number] => {
      const c = cameraAt(at);
      return focusPoint(target, at, c.yaw, c.pitch, c.radius);
    };

    // resting spot before the first click
    const start: [number, number, number] = [
      -6.2,
      3.4,
      cameraPosition(cameraAt(0.9).yaw, cameraAt(0.9).pitch, 10)[2],
    ];

    if (t < CLICKS[0].at - 0.85) return start;

    for (let i = 0; i < CLICKS.length; i++) {
      const click = CLICKS[i];
      const from: [number, number, number] =
        i === 0 ? start : toVec(CLICKS[i - 1].target, CLICKS[i - 1].at);
      const to = toVec(click.target, click.at);

      const windowStart = click.at - (i === 0 ? 0.85 : 0.95);
      if (t <= click.at) {
        const k = interpolate(t, [windowStart, click.at], [0, 1], {
          ...clamp,
          easing: Easing.inOut(Easing.cubic),
        });
        // a small arc keeps the motion from looking like a straight tween
        const arc = Math.sin(k * Math.PI);
        return [
          from[0] + (to[0] - from[0]) * k + arc * 0.9,
          from[1] + (to[1] - from[1]) * k + arc * 0.5,
          from[2] + (to[2] - from[2]) * k,
        ] as [number, number, number];
      }

      const next = CLICKS[i + 1];
      if (!next) {
        // drift away after the final click
        const k = interpolate(t, [click.at, click.at + 1.6], [0, 1], {
          ...clamp,
          easing: Easing.inOut(Easing.cubic),
        });
        return [
          to[0] + k * 2.6,
          to[1] + k * 1.5,
          to[2] + k * 1.2,
        ] as [number, number, number];
      }
    }
    return start;
  }, [t]);

  const pressAge = useMemo(() => {
    for (const c of CLICKS) {
      const d = t - c.at;
      if (d >= 0 && d < 0.45) return d / 0.45;
    }
    return 0;
  }, [t]);

  const { hovered, active } = useMemo(() => {
    let h: number | null = null;
    let a = -1;
    CLICKS.forEach((c, i) => {
      if (t > c.at - 0.45 && t < c.at + 0.25) h = c.target;
      if (t >= c.at) a = i;
    });
    return { hovered: h as number | null, active: a };
  }, [t]);

  const hitAges = useMemo(() => {
    const ages = [0, 0, 0, 0, 0];
    CLICKS.forEach((c) => {
      ages[c.target] = t - c.at;
    });
    return ages;
  }, [t]);

  const dashboard = useMemo(() => {
    if (active < 0) return null;
    const c = CLICKS[active];
    const age = t - c.at;
    if (age > 1.4) return null;
    return {
      text: c.label,
      color: ACCENTS[c.target],
      age,
      alpha: interpolate(age, [0.05, 0.5, 1.4], [0, 1, 0], clamp),
      scale: interpolate(
        age,
        [0, 0.16, 0.5],
        [0.84, 1.05, 1],
        { ...clamp, easing: Easing.out(Easing.cubic) },
      ),
    };
  }, [t, active]);

  return (
    <AbsoluteFill style={{ backgroundColor: "#03040c" }}>
      <ThreeCanvas width={width} height={height} dpr={1} flat>
        <Scene
          cursor={cursor}
          hovered={hovered}
          hitAges={hitAges}
          pressAge={pressAge}
          t={t}
          camera={camera}
        />
      </ThreeCanvas>

      {/* headline block */}
      <AbsoluteFill
        style={{ justifyContent: "flex-end", padding: 96, pointerEvents: "none" }}
      >
        <div
          style={{
            fontSize: 17,
            color: accent,
            ...mono,
            opacity: interpolate(t, [0.2, 1.1], [0, 1], clamp),
          }}
        >
          INTERACTIVE 3D · CLICK STREAM
        </div>
        <div
          style={{
            fontFamily: '"Arial Black", Impact, sans-serif',
            fontSize: 84,
            lineHeight: 1.04,
            marginTop: 12,
            color: "#ffffff",
            opacity: interpolate(t, [0.35, 1.2], [0, 1], clamp),
            translate: interpolate(t, [0.35, 1.2], ["0px 30px", "0px 0px"], {
              ...clamp,
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          POINT · CLICK · REACT
        </div>
        <div
          style={{
            fontSize: 25,
            color: "#bcd2f0",
            marginTop: 16,
            fontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif',
            opacity: interpolate(t, [1.0, 2.0], [0, 1], clamp),
          }}
        >
          光标每一次点击都会引爆一个目标 — 内核、环绕体与粒子场同步响应
        </div>
      </AbsoluteFill>

      <HUD t={t} accent={accent} active={active} />

      {/* click-response readout, centred above the headline */}
      {dashboard ? (
        <AbsoluteFill
          style={{
            justifyContent: "center",
            alignItems: "center",
            pointerEvents: "none",
            opacity: dashboard.alpha,
            scale: dashboard.scale,
            paddingBottom: 150,
          }}
        >
          <div
            style={{
              fontSize: 108,
              color: dashboard.color,
              fontFamily: '"Arial Black", Impact, sans-serif',
              lineHeight: 1,
            }}
          >
            {dashboard.text}
          </div>
          <div
            style={{
              marginTop: 14,
              fontSize: 19,
              color: "#ffffff",
              ...mono,
              opacity: 0.75,
            }}
          >
            TARGET {String(active).padStart(2, "0")} ONLINE ·{" "}
            {Math.round(dashboard.age * 1000)}ms RESPONSE
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};

const calculateMetadata: CalculateMetadataFunction<Props> = ({ props }) => {
  return {
    durationInFrames: Math.round(props.seconds * 30),
    fps: 30,
    width: 1920,
    height: 1080,
  };
};

export const PointerDemo = () => {
  return (
    <Composition
      id="PointerDemo"
      component={PointerDemoScene}
      durationInFrames={390}
      fps={30}
      width={1920}
      height={1080}
      calculateMetadata={calculateMetadata}
      defaultProps={{
        accent: "#00e5ff",
        seconds: 13,
      }}
    />
  );
};
