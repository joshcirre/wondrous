import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { Billboard, Html, Line } from "@react-three/drei";
import { CanvasTexture, Color, Group, Mesh, SRGBColorSpace } from "three";
import type { AimChip } from "../lib/aimChip";
import { type StatusBadge } from "../lib/statusCues";

export const gold = "#edce91";
export const goldDeep = "#d5b676";
export const teal = "#82b7a4";
export const teamRed = "#d99088";
export const violet = "#b79cf2";
export const healGreen = "#8fd19e";
export const spentGrey = "#7d8479";
export const steel = "#9aa4a8";
export const tan = "#c4a574";
export const ember = "#e07a42";

export const facingYaw: Record<string, number> = {
    north: 0,
    east: -Math.PI / 2,
    south: Math.PI,
    west: Math.PI / 2,
};

export function tilePos(x: number, y: number, height = 0.12): [number, number, number] {
    return [x - 3.5, height, y - 3.5];
}

export function FadeGroup({
    opacity = 1,
    children,
}: {
    opacity?: number;
    children: ReactNode;
}) {
    const ref = useRef<Group>(null);
    useLayoutEffect(() => {
        ref.current?.traverse((object) => {
            if (!(object instanceof Mesh)) return;
            const materials = Array.isArray(object.material)
                ? object.material
                : [object.material];
            for (const material of materials) {
                if (!material) continue;
                material.transparent = true;
                material.opacity = opacity;
                if ("depthWrite" in material) {
                    material.depthWrite = opacity > 0.9;
                }
            }
        });
    }, [opacity]);
    return <group ref={ref}>{children}</group>;
}

export function GoldRing({
    radius = 0.4,
    width = 0.05,
    y = 0.03,
    opacity = 0.95,
    color = gold,
}: {
    radius?: number;
    width?: number;
    y?: number;
    opacity?: number;
    color?: string;
}) {
    return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]} renderOrder={2}>
            <ringGeometry args={[radius, radius + width, 40]} />
            <meshBasicMaterial
                color={color}
                transparent
                opacity={opacity}
                depthTest={false}
                depthWrite={false}
            />
        </mesh>
    );
}

export function DashedRing({
    radius = 0.38,
    y = 0.03,
}: {
    radius?: number;
    y?: number;
}) {
    return (
        <group>
            {Array.from({ length: 14 }, (_, i) => (
                <mesh
                    key={i}
                    rotation={[-Math.PI / 2, 0, (i * Math.PI) / 7]}
                    position={[0, y, 0]}
                    renderOrder={3}
                >
                    <ringGeometry
                        args={[radius, radius + 0.07, 12, 1, 0, Math.PI / 14]}
                    />
                    <meshBasicMaterial
                        color={spentGrey}
                        depthTest={false}
                        depthWrite={false}
                    />
                </mesh>
            ))}
        </group>
    );
}

export function FacingArrow({
    yaw,
    color = gold,
    y = 0.04,
}: {
    yaw: number;
    color?: string;
    y?: number;
}) {
    return (
        <group rotation={[0, yaw, 0]}>
            <mesh
                rotation={[-Math.PI / 2, 0, Math.PI]}
                position={[0, y, -0.46]}
            >
                <circleGeometry args={[0.07, 3]} />
                <meshBasicMaterial color={color} />
            </mesh>
        </group>
    );
}

export function dimSpentColor(hex: string): string {
    const color = new Color(hex).lerp(new Color(spentGrey), 0.4);
    color.multiplyScalar(0.6);
    return `#${color.getHexString()}`;
}

export function BaseFacingArrow({
    color,
    tucked = false,
}: {
    color: string;
    tucked?: boolean;
}) {
    const size = tucked ? 0.09 : 0.16;
    const z = tucked ? -0.2 : -0.5;
    return (
        <group position={[0, 0.055, z]}>
            <mesh rotation={[-Math.PI / 2, 0, Math.PI]} renderOrder={6}>
                <circleGeometry args={[size, 3]} />
                <meshBasicMaterial
                    color={color}
                    depthTest={false}
                    depthWrite={false}
                />
            </mesh>
            {!tucked && (
                <mesh
                    rotation={[-Math.PI / 2, 0, 0]}
                    position={[0, 0, 0.08]}
                    renderOrder={6}
                >
                    <planeGeometry args={[0.055, 0.12]} />
                    <meshBasicMaterial
                        color={color}
                        depthTest={false}
                        depthWrite={false}
                    />
                </mesh>
            )}
        </group>
    );
}

export function SplitFacingRing({
    facing,
    showLabels = false,
}: {
    facing: string;
    showLabels?: boolean;
}) {
    const yaw = facingYaw[facing] ?? 0;
    return (
        <group rotation={[0, yaw, 0]}>
            {[
                { start: -Math.PI / 4, color: steel, key: "front" },
                { start: Math.PI / 4, color: tan, key: "right" },
                { start: (3 * Math.PI) / 4, color: healGreen, key: "rear" },
                { start: (-3 * Math.PI) / 4, color: tan, key: "left" },
            ].map((arc) => (
                <mesh
                    key={arc.key}
                    rotation={[-Math.PI / 2, 0, arc.start]}
                    position={[0, 0.028, 0]}
                >
                    <ringGeometry
                        args={[0.36, 0.46, 16, 1, 0, Math.PI / 2]}
                    />
                    <meshBasicMaterial
                        color={arc.color}
                        transparent
                        opacity={0.92}
                    />
                </mesh>
            ))}
            {showLabels && (
                <Html position={[0, 0.12, 0.52]} center>
                    <span className="facing-no-block">no block</span>
                </Html>
            )}
        </group>
    );
}

export function FacingControls({
    onFace,
    interactive,
}: {
    onFace: (facing: string) => void;
    interactive: boolean;
}) {
    return (
        <group>
            {(
                [
                    ["north", 0],
                    ["east", -Math.PI / 2],
                    ["south", Math.PI],
                    ["west", Math.PI / 2],
                ] as const
            ).map(([dir, yaw]) => (
                <group key={dir} rotation={[0, yaw, 0]}>
                    <mesh
                        rotation={[-Math.PI / 2, 0, Math.PI]}
                        position={[0, 0.05, -0.62]}
                        onClick={(event) => {
                            event.stopPropagation();
                            if (interactive) onFace(dir);
                        }}
                        onPointerOver={(event) => {
                            event.stopPropagation();
                            if (interactive) document.body.style.cursor = "pointer";
                        }}
                        onPointerOut={() => {
                            document.body.style.cursor = "auto";
                        }}
                    >
                        <circleGeometry args={[0.08, 3]} />
                        <meshBasicMaterial color={gold} />
                    </mesh>
                </group>
            ))}
        </group>
    );
}

export function DottedTrail({
    points,
    color = gold,
}: {
    points: [number, number][];
    color?: string;
}) {
    const world = points.map(([x, y]) => tilePos(x, y, 0.16));
    const dots: [number, number, number][] = [];
    for (let i = 0; i < world.length - 1; i++) {
        const a = world[i];
        const b = world[i + 1];
        for (let s = 0; s < 5; s++) {
            const t = s / 5;
            dots.push([
                a[0] + (b[0] - a[0]) * t,
                a[1],
                a[2] + (b[2] - a[2]) * t,
            ]);
        }
    }
    if (world.length) dots.push(world[world.length - 1]);
    return (
        <group>
            {dots.map((point, i) => (
                <mesh key={i} position={point}>
                    <sphereGeometry args={[0.03, 8, 8]} />
                    <meshBasicMaterial color={color} />
                </mesh>
            ))}
        </group>
    );
}

export function GhostMarker({
    x,
    y,
    facing,
}: {
    x: number;
    y: number;
    facing: string;
}) {
    return (
        <group position={tilePos(x, y, 0)}>
            <GoldRing radius={0.34} width={0.055} y={0.14} opacity={0.7} />
            <FacingArrow yaw={facingYaw[facing] ?? 0} color={gold} y={0.15} />
        </group>
    );
}

export function Crosshair() {
    return (
        <group position={[0, 1.15, 0]}>
            {[0, 1, 2, 3].map((i) => (
                <group key={i} rotation={[0, (i * Math.PI) / 2, 0]}>
                    <mesh position={[0.22, 0, 0.22]}>
                        <boxGeometry args={[0.12, 0.02, 0.025]} />
                        <meshBasicMaterial color={gold} />
                    </mesh>
                    <mesh position={[0.22, 0, 0.22]}>
                        <boxGeometry args={[0.025, 0.02, 0.12]} />
                        <meshBasicMaterial color={gold} />
                    </mesh>
                </group>
            ))}
        </group>
    );
}

export function AimLine({
    from,
    to,
    color = gold,
}: {
    from: { x: number; y: number };
    to: { x: number; y: number };
    color?: string;
}) {
    return (
        <Line
            points={[tilePos(from.x, from.y, 0.55), tilePos(to.x, to.y, 0.55)]}
            color={color}
            dashed
            dashSize={0.12}
            gapSize={0.08}
            lineWidth={1.6}
        />
    );
}

export function AimChipCard({ chip }: { chip: AimChip }) {
    return (
        <Html
            position={[0, 1.7, 0]}
            center
            sprite
            style={{ pointerEvents: "none" }}
        >
            <div className="aim-chip">
                <strong>{chip.landChance}%</strong>
                {chip.breakdown && (
                    <p>
                        {chip.breakdown.hit}% hit · {chip.breakdown.block}% block
                        · {chip.breakdown.side}
                    </p>
                )}
                <p className={chip.damage.ember ? "ember" : ""}>
                    {chip.damage.text}
                </p>
                {chip.otherBlocks && (
                    <small>
                        {chip.otherBlocks
                            .map((side) => `${side.side} ${side.chance}%`)
                            .join(" · ")}
                    </small>
                )}
            </div>
        </Html>
    );
}

export function ActionStrip({
    mode,
    skillName,
    skillKind,
    onMode,
}: {
    mode: "attack" | "skill";
    skillName: string;
    skillKind: "heal" | "skill";
    onMode: (mode: "attack" | "skill") => void;
}) {
    return (
        <Html
            position={[0, 0.02, 0.62]}
            center
            sprite
            style={{ pointerEvents: "none" }}
        >
            <div className="board-action-strip">
                <button
                    type="button"
                    className={mode === "attack" ? "on" : ""}
                    onClick={(event) => {
                        event.stopPropagation();
                        onMode("attack");
                    }}
                >
                    Attack · A
                </button>
                <button
                    type="button"
                    className={`skill ${mode === "skill" ? "on" : ""} ${skillKind}`}
                    onClick={(event) => {
                        event.stopPropagation();
                        onMode("skill");
                    }}
                >
                    {skillName} · S
                </button>
            </div>
        </Html>
    );
}

export function SwapCue({
    a,
    b,
}: {
    a: { x: number; y: number };
    b: { x: number; y: number };
}) {
    const start = tilePos(a.x, a.y, 0.22);
    const end = tilePos(b.x, b.y, 0.22);
    const mid: [number, number, number] = [
        (start[0] + end[0]) / 2,
        0.35,
        (start[2] + end[2]) / 2,
    ];
    return (
        <group>
            <group position={tilePos(a.x, a.y)}>
                <GoldRing radius={0.4} width={0.06} y={0.14} />
            </group>
            <group position={tilePos(b.x, b.y)}>
                <GoldRing radius={0.4} width={0.06} y={0.14} />
            </group>
            <Line points={[start, end]} color={gold} lineWidth={1.4} />
            <mesh position={mid} rotation={[0, Math.atan2(end[0] - start[0], end[2] - start[2]), 0]}>
                <boxGeometry args={[0.18, 0.02, 0.04]} />
                <meshBasicMaterial color={gold} />
            </mesh>
            <mesh
                position={mid}
                rotation={[
                    -Math.PI / 2,
                    0,
                    Math.atan2(end[0] - start[0], end[2] - start[2]),
                ]}
            >
                <circleGeometry args={[0.07, 3]} />
                <meshBasicMaterial color={gold} />
            </mesh>
        </group>
    );
}

export function FloatingResultCard({
    kind,
    title,
    value,
    chance,
    rise,
    opacity,
}: {
    kind: "hit" | "block" | "miss" | "heal";
    title: string;
    value?: number;
    chance?: number;
    rise: number;
    opacity: number;
}) {
    const worldRise = rise / 80;
    return (
        <Html
            position={[0, 1.55 + worldRise, 0]}
            center
            transform={false}
            occlude={false}
            zIndexRange={[200, 0]}
            style={{
                pointerEvents: "none",
                opacity,
                zIndex: 20,
                fontSize: 16,
            }}
        >
            <div
                className={`board-float ${kind}`}
                data-float-overlay={`${kind}:${title}:${value ?? ""}:${chance ?? ""}`}
            >
                {value !== undefined && <strong>{value}</strong>}
                <span>{title}</span>
                {chance !== undefined && <small>{chance}%</small>}
            </div>
        </Html>
    );
}

export function DeathBannerMarker({
    friendly,
}: {
    friendly: boolean;
}) {
    const color = friendly ? teal : teamRed;
    return (
        <group>
            <mesh position={[0, 0.42, 0]}>
                <boxGeometry args={[0.05, 0.72, 0.05]} />
                <meshBasicMaterial color="#d8c9a1" />
            </mesh>
            <mesh position={[0.22, 0.62, 0]}>
                <boxGeometry args={[0.38, 0.24, 0.03]} />
                <meshBasicMaterial color={color} />
            </mesh>
            <Html
                position={[0.12, 1.05, 0]}
                center
                style={{ pointerEvents: "none" }}
            >
                <div className={`death-flag-label ${friendly ? "teal" : "red"}`}>
                    Fallen
                </div>
            </Html>
        </group>
    );
}

export function MotionEffectMesh({
    kind,
    color,
    from,
    to,
    progress,
}: {
    kind: "streak" | "ring" | "rise" | "glow" | "projectile" | "shield";
    color: string;
    from: [number, number];
    to: [number, number];
    progress: number;
}) {
    const start = tilePos(from[0], from[1], 0.7);
    const end = tilePos(to[0], to[1], 0.7);
    const x = start[0] + (end[0] - start[0]) * progress;
    const z = start[2] + (end[2] - start[2]) * progress;
    if (kind === "streak") {
        const dx = end[0] - start[0];
        const dz = end[2] - start[2];
        const length = Math.hypot(dx, dz) || 0.4;
        return (
            <group
                position={[
                    start[0] + dx * progress,
                    0.7,
                    start[2] + dz * progress,
                ]}
                rotation={[0, Math.atan2(dx, dz), 0]}
            >
                <mesh>
                    <boxGeometry args={[0.06, 0.06, Math.max(0.35, length * 0.35)]} />
                    <meshBasicMaterial color={color} />
                </mesh>
            </group>
        );
    }
    if (kind === "ring" || kind === "shield") {
        const scale = 0.4 + progress * 0.7;
        return (
            <mesh
                rotation={[-Math.PI / 2, 0, 0]}
                position={tilePos(to[0], to[1], 0.2)}
                scale={scale}
            >
                <ringGeometry args={[0.22, 0.34, 28]} />
                <meshBasicMaterial
                    color={color}
                    transparent
                    opacity={1 - progress * 0.65}
                />
            </mesh>
        );
    }
    if (kind === "rise") {
        return (
            <group position={tilePos(to[0], to[1], 0.2 + progress * 0.7)}>
                {[0, 1, 2].map((i) => (
                    <mesh
                        key={i}
                        position={[
                            Math.sin(i * 2.1) * 0.12,
                            i * 0.08,
                            Math.cos(i * 2.1) * 0.12,
                        ]}
                    >
                        <octahedronGeometry args={[0.07, 0]} />
                        <meshBasicMaterial
                            color={color}
                            transparent
                            opacity={1 - progress * 0.4}
                        />
                    </mesh>
                ))}
            </group>
        );
    }
    if (kind === "projectile") {
        return (
            <mesh position={[x, 0.75, z]}>
                <sphereGeometry args={[0.07, 10, 10]} />
                <meshBasicMaterial color={color} />
            </mesh>
        );
    }
    return (
        <mesh position={tilePos(to[0], to[1], 0.55)}>
            <sphereGeometry args={[0.18 + progress * 0.12, 12, 12]} />
            <meshBasicMaterial
                color={color}
                transparent
                opacity={0.7 - progress * 0.4}
            />
        </mesh>
    );
}

function badgeInk(color: string): string {
    const value = new Color(color);
    return value.r * 0.3 + value.g * 0.5 + value.b * 0.2 > 0.45
        ? "#1a1d18"
        : "#f4f1e6";
}

function makeBadgeTexture(badge: StatusBadge): CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 160;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        return new CanvasTexture(canvas);
    }
    const ink = badgeInk(badge.color);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = badge.color;
    roundRect(ctx, 8, 12, 240, 136, 40);
    ctx.fill();
    ctx.lineWidth = 8;
    ctx.strokeStyle = "#141612";
    ctx.stroke();
    ctx.fillStyle = ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 72px Cinzel, serif";
    ctx.fillText(badge.glyph, 78, 82);
    ctx.font = "700 70px Inter, sans-serif";
    ctx.fillText(badge.text, 176, 84);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
}

function roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function StatusBadgeChip({
    badge,
    index,
    count,
}: {
    badge: StatusBadge;
    index: number;
    count: number;
}) {
    const texture = useMemo(
        () => makeBadgeTexture(badge),
        [badge.color, badge.glyph, badge.id, badge.text],
    );
    useEffect(() => () => texture.dispose(), [texture]);
    return (
        <Billboard
            position={[(index - (count - 1) / 2) * 0.7, 1.98, 0]}
        >
            <mesh renderOrder={8}>
                <planeGeometry args={[0.66, 0.4]} />
                <meshBasicMaterial
                    map={texture}
                    transparent
                    depthTest={false}
                    depthWrite={false}
                />
            </mesh>
            <Html
                center
                occlude={false}
                zIndexRange={[180, 0]}
                style={{ fontSize: 16 }}
            >
                <button
                    type="button"
                    className="status-badge-hit"
                    aria-label={badge.label}
                    data-label={badge.label}
                    data-status={badge.id}
                    data-badge-index={index}
                />
            </Html>
        </Billboard>
    );
}

export function MoonBadge({ turns }: { turns: number }) {
    return (
        <StatusBadgeRow
            badges={[
                {
                    id: "rest",
                    glyph: "☾",
                    color: spentGrey,
                    turns,
                    text: String(turns),
                    label: `Recovering · ${turns}`,
                    left: 0,
                    width: 32,
                },
            ]}
        />
    );
}

export function StatusBadgeRow({ badges }: { badges: StatusBadge[] }) {
    if (!badges.length) return null;
    return (
        <group>
            {badges.map((badge, index) => (
                <StatusBadgeChip
                    key={badge.id}
                    badge={badge}
                    index={index}
                    count={badges.length}
                />
            ))}
        </group>
    );
}

