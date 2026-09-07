import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Billboard, OrbitControls } from "@react-three/drei";
import {
    CanvasTexture,
    Color,
    InstancedMesh,
    Object3D,
    Group,
    Mesh,
    MeshBasicMaterial,
    OrthographicCamera,
    PCFShadowMap,
    Points,
    PointsMaterial,
    SRGBColorSpace,
    Vector3,
} from "three";
import Miniature from "./miniatures";

type Unit = {
    id: string;
    character_id: string;
    owner_id: number;
    x: number;
    y: number;
    hp: number;
    max_hp: number;
    mana: number;
    facing?: string;
    recovery?: number;
};
type Props = {
    units: Unit[];
    viewerId: number;
    selectedId: string | null;
    onSelect: (id: string) => void;
    onTile: (x: number, y: number) => void;
    highlights?: Array<{ x: number; y: number; kind?: string }>;
    deployment?: boolean;
    interactive?: boolean;
    homeSide?: "north" | "south";
};
const teal = "#62dfc2",
    red = "#eb8173";
function FitCamera({ homeSide }: { homeSide: "north" | "south" }) {
    const { camera, size } = useThree();
    useLayoutEffect(() => {
        const c = camera as OrthographicCamera;
        c.zoom = Math.min(size.width / 12.8, size.height / 11.4);
        c.updateProjectionMatrix();
    }, [camera, size]);
    useLayoutEffect(() => {
        const side = homeSide === "north" ? -1 : 1;
        camera.position.set(9 * side, 12, 13 * side);
        camera.lookAt(0, 0, 0);
    }, [camera, homeSide]);
    return null;
}
function Pawn({
    unit,
    selected,
    friendly,
    onSelect,
    interactive,
}: {
    unit: Unit;
    selected: boolean;
    friendly: boolean;
    onSelect: Props["onSelect"];
    interactive: boolean;
}) {
    const group = useRef<Group>(null);
    const facing = useRef<Group>(null);
    const direction =
        (
            {
                north: 0,
                east: -Math.PI / 2,
                south: Math.PI,
                west: Math.PI / 2,
            } as Record<string, number>
        )[unit.facing ?? (friendly ? "north" : "south")] ?? 0;
    const initialPosition = useRef<[number, number, number]>([
        unit.x - 3.5,
        0.13,
        unit.y - 3.5,
    ]);
    const initialDirection = useRef<[number, number, number]>([
        0,
        direction,
        0,
    ]);
    const target = new Vector3(unit.x - 3.5, 0.13, unit.y - 3.5);
    useFrame((_, dt) => {
        group.current?.position.lerp(target, 1 - Math.exp(-12 * dt));
        if (facing.current) {
            const delta = Math.atan2(
                Math.sin(direction - facing.current.rotation.y),
                Math.cos(direction - facing.current.rotation.y),
            );
            facing.current.rotation.y += delta * (1 - Math.exp(-14 * dt));
        }
    });
    return (
        <group
            ref={group}
            position={initialPosition.current}
            onClick={(e) => {
                e.stopPropagation();
                if (interactive && unit.hp > 0) onSelect(unit.id);
            }}
            onPointerOver={(e) => {
                e.stopPropagation();
                if (interactive) document.body.style.cursor = "pointer";
            }}
            onPointerOut={() => {
                document.body.style.cursor = "auto";
            }}
        >
            {selected && unit.hp > 0 && (
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
                    <ringGeometry args={[0.37, 0.44, 40]} />
                    <meshBasicMaterial
                        color="#ffe4a0"
                        transparent
                        opacity={0.95}
                    />
                </mesh>
            )}
            <group
                ref={facing}
                rotation={initialDirection.current}
                visible={unit.hp > 0}
            >
                <Miniature
                    id={unit.character_id}
                    color={friendly ? teal : red}
                />
                <mesh
                    rotation={[-Math.PI / 2, 0, Math.PI]}
                    position={[0, 0.026, -0.37]}
                >
                    <circleGeometry args={[0.055, 3]} />
                    <meshBasicMaterial color={friendly ? teal : red} />
                </mesh>
            </group>
            <CombatEffect hp={unit.hp} mana={unit.mana} />
            <Billboard visible={unit.hp > 0} position={[0, 1.37, 0]}>
                <mesh>
                    <planeGeometry args={[0.55, 0.067]} />
                    <meshBasicMaterial color="#192623" depthTest={false} />
                </mesh>
                <mesh
                    position={[-0.25 * (1 - unit.hp / unit.max_hp), 0, 0.002]}
                >
                    <planeGeometry
                        args={[
                            0.5 * Math.max(0.01, unit.hp / unit.max_hp),
                            0.031,
                        ]}
                    />
                    <meshBasicMaterial
                        color={friendly ? teal : red}
                        depthTest={false}
                    />
                </mesh>
                {(unit.recovery ?? 0) > 0 && (
                    <mesh position={[0.34, 0, 0]}>
                        <circleGeometry args={[0.04, 8]} />
                        <meshBasicMaterial color="#e4ba72" depthTest={false} />
                    </mesh>
                )}
            </Billboard>
        </group>
    );
}

function CombatEffect({ hp, mana }: { hp: number; mana: number }) {
    const previous = useRef({ hp, mana });
    const age = useRef(2);
    const effect = useRef<Group>(null);
    const ring = useRef<Mesh>(null);
    const sparks = useRef<Points>(null);
    const positions = useMemo(
        () =>
            new Float32Array(
                Array.from({ length: 36 }, (_, i) =>
                    i % 3 === 1
                        ? (Math.floor(i / 3) % 3) * 0.15
                        : Math.sin(
                              Math.floor(i / 3) * 2.4 + ((i % 3) * Math.PI) / 2,
                          ) * 0.32,
                ),
            ),
        [],
    );
    useEffect(() => {
        const delta = hp - previous.current.hp;
        if (delta !== 0 || mana < previous.current.mana) {
            age.current = 0;
            const color =
                delta < 0 ? "#ff7159" : delta > 0 ? "#a2ffc2" : "#c5a0ff";
            (ring.current?.material as MeshBasicMaterial)?.color.set(color);
            (sparks.current?.material as PointsMaterial)?.color.set(color);
        }
        previous.current = { hp, mana };
    }, [hp, mana]);
    useFrame((_, dt) => {
        age.current += dt;
        if (!effect.current || !ring.current || !sparks.current) return;
        effect.current.visible = age.current < 1;
        if (age.current >= 1) return;
        ring.current.scale.setScalar(0.7 + age.current * 1.7);
        (ring.current.material as MeshBasicMaterial).opacity =
            (1 - age.current) * 0.8;
        sparks.current.position.y = 0.35 + age.current * 0.9;
        sparks.current.scale.setScalar(0.6 + age.current);
        (sparks.current.material as PointsMaterial).opacity = 1 - age.current;
    });
    return (
        <group ref={effect} visible={false}>
            <mesh
                ref={ring}
                rotation={[-Math.PI / 2, 0, 0]}
                position={[0, 0.04, 0]}
            >
                <ringGeometry args={[0.27, 0.34, 28]} />
                <meshBasicMaterial transparent depthWrite={false} />
            </mesh>
            <points ref={sparks}>
                <bufferGeometry>
                    <bufferAttribute
                        attach="attributes-position"
                        args={[positions, 3]}
                    />
                </bufferGeometry>
                <pointsMaterial
                    size={0.055}
                    transparent
                    depthWrite={false}
                    sizeAttenuation
                />
            </points>
        </group>
    );
}
function Coordinates() {
    const texture = useMemo(() => {
        const canvas = document.createElement("canvas");
        canvas.width = 1024;
        canvas.height = 1024;
        const context = canvas.getContext("2d")!;
        context.font = "600 22px Georgia";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillStyle = "#efe0b5";
        const pixel = (value: number) => (value / 8.6 + 0.5) * 1024;
        for (let i = 0; i < 8; i++) {
            const v = pixel(i - 3.5);
            context.fillText(String.fromCharCode(65 + i), v, pixel(4.13));
            context.fillText(String.fromCharCode(65 + i), v, pixel(-4.13));
            context.fillText(String(8 - i), pixel(-4.13), v);
            context.fillText(String(8 - i), pixel(4.13), v);
        }
        const result = new CanvasTexture(canvas);
        result.colorSpace = SRGBColorSpace;
        return result;
    }, []);
    useEffect(() => () => texture.dispose(), [texture]);
    return (
        <mesh
            position={[0, 0.103, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            raycast={() => {}}
        >
            <planeGeometry args={[8.6, 8.6]} />
            <meshBasicMaterial
                map={texture}
                transparent
                depthWrite={false}
                polygonOffset
                polygonOffsetFactor={-1}
            />
        </mesh>
    );
}

function Brazier({ x, z }: { x: number; z: number }) {
    const fire = useRef<Group>(null);
    useFrame(({ clock }) => {
        if (fire.current) {
            fire.current.scale.y =
                0.9 + Math.sin(clock.elapsedTime * 7 + x) * 0.13;
            fire.current.rotation.y = clock.elapsedTime * 0.6;
        }
    });
    return (
        <group position={[x, -0.25, z]}>
            <mesh position={[0, 0.25, 0]} castShadow>
                <cylinderGeometry args={[0.16, 0.24, 0.5, 6]} />
                <meshStandardMaterial color="#626456" />
            </mesh>
            <mesh position={[0, 0.53, 0]}>
                <cylinderGeometry args={[0.25, 0.13, 0.16, 8]} />
                <meshStandardMaterial
                    color="#514536"
                    metalness={0.6}
                    roughness={0.5}
                />
            </mesh>
            <group ref={fire} position={[0, 0.66, 0]}>
                <mesh>
                    <coneGeometry args={[0.16, 0.43, 5]} />
                    <meshStandardMaterial
                        color="#ffb74d"
                        emissive="#ff8e23"
                        emissiveIntensity={2}
                    />
                </mesh>
                <mesh position={[0, -0.02, 0.05]}>
                    <coneGeometry args={[0.09, 0.3, 5]} />
                    <meshBasicMaterial color="#ffedaa" />
                </mesh>
            </group>
            <pointLight
                position={[0, 0.95, 0]}
                color="#ffb35f"
                intensity={2}
                distance={2.4}
            />
        </group>
    );
}
const autumnColors = [
    "#ce8131",
    "#e2ad43",
    "#b74c2c",
    "#e9bd55",
    "#a94a31",
    "#cf6931",
];
function AutumnGrove() {
    const crowns = useRef<InstancedMesh>(null),
        trunks = useRef<InstancedMesh>(null),
        branches = useRef<InstancedMesh>(null);
    useLayoutEffect(() => {
        if (!crowns.current || !trunks.current || !branches.current) return;
        const transform = new Object3D();
        for (let i = 0; i < 36; i++) {
            const angle = i * 2.39996,
                radius = 9.6 + (i % 4) * 1.1;
            const x = Math.sin(angle) * radius,
                z = Math.cos(angle) * radius;
            const height = 0.72 + (i % 5) * 0.12;
            transform.position.set(x, -0.66 + height / 2, z);
            transform.rotation.set(0, angle, 0);
            transform.scale.set(0.14, height, 0.14);
            transform.updateMatrix();
            trunks.current.setMatrixAt(i, transform.matrix);
            for (let j = 0; j < 2; j++) {
                transform.position.set(
                    x + (j ? -0.25 : 0.25),
                    height * 0.65 - 0.6,
                    z,
                );
                transform.rotation.set(0.2, angle, j ? -0.65 : 0.65);
                transform.scale.set(0.075, height * 0.7, 0.075);
                transform.updateMatrix();
                branches.current.setMatrixAt(i * 2 + j, transform.matrix);
            }
            for (let j = 0; j < 4; j++) {
                transform.position.set(
                    x + Math.sin(j * 2.4) * 0.52,
                    height - 0.3 + (j === 3 ? 0.32 : 0),
                    z + Math.cos(j * 2.4) * 0.48,
                );
                transform.rotation.set(i * 0.31, j * 0.5, i * 0.2);
                transform.scale.set(
                    0.43 + (i % 3) * 0.06,
                    0.43 + (j % 2) * 0.1,
                    0.43 + (i % 2) * 0.06,
                );
                transform.updateMatrix();
                crowns.current.setMatrixAt(i * 4 + j, transform.matrix);
                crowns.current.setColorAt(
                    i * 4 + j,
                    new Color(autumnColors[(i + j) % autumnColors.length]),
                );
            }
        }
        // Low leaf-covered shrubs dress the near perimeter without rising into sight lines.
        for (let i = 0; i < 24; i++) {
            const angle = i * 2.39996,
                radius = 6.6 + (i % 3) * 0.5;
            transform.position.set(
                Math.sin(angle) * radius,
                -0.49,
                Math.cos(angle) * radius,
            );
            transform.rotation.set(0, angle, 0);
            transform.scale.set(0.42, 0.23, 0.33);
            transform.updateMatrix();
            crowns.current.setMatrixAt(144 + i, transform.matrix);
            crowns.current.setColorAt(144 + i, new Color(autumnColors[i % 6]));
        }
        for (const mesh of [crowns.current, trunks.current, branches.current]) {
            mesh.instanceMatrix.needsUpdate = true;
            mesh.computeBoundingSphere();
        }
        if (crowns.current.instanceColor)
            crowns.current.instanceColor.needsUpdate = true;
    }, []);
    return (
        <group>
            <instancedMesh
                ref={trunks}
                args={[undefined, undefined, 36]}
                castShadow
            >
                <cylinderGeometry args={[0.6, 1, 1, 7]} />
                <meshStandardMaterial color="#765036" roughness={1} />
            </instancedMesh>
            <instancedMesh
                ref={branches}
                args={[undefined, undefined, 72]}
                castShadow
            >
                <cylinderGeometry args={[0.4, 1, 1, 5]} />
                <meshStandardMaterial color="#79543b" roughness={1} />
            </instancedMesh>
            <instancedMesh
                ref={crowns}
                args={[undefined, undefined, 168]}
                castShadow
                receiveShadow
            >
                <icosahedronGeometry args={[1, 1]} />
                <meshStandardMaterial roughness={0.92} />
            </instancedMesh>
        </group>
    );
}
function FallingLeaves() {
    const leaves = useRef<InstancedMesh>(null);
    const transform = useMemo(() => new Object3D(), []);
    const reduced = useMemo(
        () =>
            typeof matchMedia !== "undefined" &&
            matchMedia("(prefers-reduced-motion: reduce)").matches,
        [],
    );
    useFrame(({ clock }) => {
        if (!leaves.current) return;
        const t = reduced ? 0 : clock.elapsedTime;
        for (let i = 0; i < 60; i++) {
            const angle = i * 2.39996,
                radius = 5.7 + (i % 5);
            transform.position.set(
                Math.sin(angle) * radius + Math.sin(t * 0.4 + i) * 0.45,
                3.3 - ((t * 0.35 + i * 0.47) % 4),
                Math.cos(angle) * radius + Math.cos(t * 0.3 + i) * 0.4,
            );
            transform.rotation.set(t * 0.6 + i, t * 0.4 + i, i);
            transform.scale.set(0.055, 0.1, 0.012);
            transform.updateMatrix();
            leaves.current.setMatrixAt(i, transform.matrix);
        }
        leaves.current.instanceMatrix.needsUpdate = true;
    });
    return (
        <instancedMesh
            ref={leaves}
            args={[undefined, undefined, 60]}
            frustumCulled={false}
        >
            <octahedronGeometry args={[1, 0]} />
            <meshStandardMaterial color="#f0b04c" roughness={0.8} />
        </instancedMesh>
    );
}
function Castle() {
    return (
        <group
            position={[-0.5, -0.68, -9.5]}
            scale={0.48}
            rotation={[0, 0.12, 0]}
        >
            <mesh position={[0, 0.9, 0]} castShadow>
                <boxGeometry args={[4.1, 1.8, 0.7]} />
                <meshStandardMaterial color="#c2b9a2" roughness={0.9} />
            </mesh>
            <mesh position={[0, 1.05, 0.37]}>
                <boxGeometry args={[0.65, 1.65, 0.08]} />
                <meshStandardMaterial color="#524337" />
            </mesh>
            {[-1.8, 1.8].map((x, i) => (
                <group key={x} position={[x, 0, 0]}>
                    <mesh position={[0, 1.4, 0]} castShadow>
                        <cylinderGeometry args={[0.58, 0.65, 2.8, 10]} />
                        <meshStandardMaterial color="#d7cbb0" roughness={0.9} />
                    </mesh>
                    <mesh position={[0, 3.05, 0]} castShadow>
                        <coneGeometry args={[0.83, 1.15, 10]} />
                        <meshStandardMaterial color="#50677a" roughness={0.7} />
                    </mesh>
                    <mesh position={[0, 2, 0.575]}>
                        <boxGeometry args={[0.13, 0.42, 0.025]} />
                        <meshStandardMaterial color="#554d42" />
                    </mesh>
                    <mesh position={[0, 3.8, 0]}>
                        <cylinderGeometry args={[0.018, 0.018, 0.65, 5]} />
                        <meshStandardMaterial color="#bf914c" />
                    </mesh>
                    <mesh position={[0.23, 3.95, 0]}>
                        <boxGeometry args={[0.46, 0.24, 0.025]} />
                        <meshStandardMaterial
                            color={i ? "#bd623b" : "#d9ab4d"}
                        />
                    </mesh>
                </group>
            ))}
            {Array.from({ length: 9 }, (_, i) => (
                <mesh key={i} position={[i * 0.44 - 1.76, 1.98, 0]} castShadow>
                    <boxGeometry args={[0.23, 0.4, 0.73]} />
                    <meshStandardMaterial color="#d4c7ad" />
                </mesh>
            ))}
            <mesh position={[0, 1.8, -0.65]} castShadow>
                <boxGeometry args={[1.7, 3.6, 1.4]} />
                <meshStandardMaterial color="#b9b49f" roughness={0.9} />
            </mesh>
            <mesh position={[0, 4, -0.65]} rotation={[0, Math.PI / 4, 0]}>
                <coneGeometry args={[1.43, 1.3, 4]} />
                <meshStandardMaterial color="#49657a" />
            </mesh>
        </group>
    );
}
function Landscape() {
    return (
        <group>
            <mesh
                rotation={[-Math.PI / 2, 0, 0]}
                position={[0, -0.68, 0]}
                receiveShadow
            >
                <circleGeometry args={[24, 64]} />
                <meshStandardMaterial color="#84734b" roughness={1} />
            </mesh>
            <mesh
                rotation={[-Math.PI / 2, 0, 0]}
                position={[0, -0.674, 0]}
                receiveShadow
            >
                <ringGeometry args={[4.8, 6.1, 48]} />
                <meshStandardMaterial color="#b49a69" roughness={1} />
            </mesh>
            <AutumnGrove />
            <FallingLeaves />
            <Castle />
            {[-1, 1].flatMap((x) =>
                [-1, 1].map((z) => (
                    <Brazier key={`${x}:${z}`} x={x * 4.45} z={z * 4.45} />
                )),
            )}
            {Array.from({ length: 18 }, (_, i) => (
                <mesh
                    key={i}
                    position={[
                        Math.sin(i * 2.4) * (5.1 + (i % 3)),
                        -0.53,
                        Math.cos(i * 2.4) * (5.1 + (i % 3)),
                    ]}
                    rotation={[i, 0.4 * i, i * 0.6]}
                    castShadow
                >
                    <dodecahedronGeometry args={[0.14 + (i % 3) * 0.07, 0]} />
                    <meshStandardMaterial
                        color={i % 2 ? "#a89978" : "#796447"}
                        roughness={1}
                    />
                </mesh>
            ))}
            {[
                [-12, 6, -15],
                [-4, 8, -19],
                [8, 7, -17],
            ].map(([x, y, z], i) => (
                <group key={i} position={[x, y, z]}>
                    {[0, 1, 2].map((j) => (
                        <mesh
                            key={j}
                            position={[j * 1.4, Math.sin(j) * 0.6, 0]}
                            scale={[2, 1.05, 1]}
                        >
                            <icosahedronGeometry args={[1.4, 2]} />
                            <meshStandardMaterial
                                color="#fff8e9"
                                roughness={1}
                            />
                        </mesh>
                    ))}
                </group>
            ))}
        </group>
    );
}
function Scene({
    units,
    viewerId,
    selectedId,
    onSelect,
    onTile,
    highlights = [],
    deployment = false,
    interactive = true,
    homeSide = "south",
}: Props) {
    return (
        <>
            <color attach="background" args={["#9cbfc9"]} />
            <fog attach="fog" args={["#d7c9a9", 22, 48]} />
            <ambientLight intensity={0.95} />
            <hemisphereLight args={["#e6f1fa", "#88613c", 1.2]} />
            <directionalLight
                position={[-5, 12, 6]}
                intensity={2.3}
                color="#ffe4b4"
                castShadow
                shadow-mapSize={[2048, 2048]}
                shadow-camera-left={-9}
                shadow-camera-right={9}
                shadow-camera-top={9}
                shadow-camera-bottom={-9}
                shadow-normalBias={0.035}
            />
            <FitCamera homeSide={homeSide} />
            <Coordinates />
            <OrbitControls
                makeDefault
                target={[0, 0, 0]}
                enablePan={false}
                minPolarAngle={0.42}
                maxPolarAngle={1.08}
                minZoom={10}
                maxZoom={110}
                enableDamping
            />
            <Landscape />
            <mesh position={[0, -0.36, 0]} receiveShadow castShadow>
                <boxGeometry args={[9, 0.6, 9]} />
                <meshStandardMaterial color="#75644e" roughness={0.85} />
            </mesh>
            <mesh position={[0, -0.08, 0]} receiveShadow castShadow>
                <boxGeometry args={[8.75, 0.13, 8.75]} />
                <meshStandardMaterial color="#c3a87b" roughness={0.75} />
            </mesh>
            {[-1, 1].flatMap((a) =>
                [0, 1].map((axis) => (
                    <group
                        key={`${a}-${axis}`}
                        rotation={[0, (axis * Math.PI) / 2, 0]}
                    >
                        <mesh position={[a * 4.3, 0.025, 0]} castShadow>
                            <boxGeometry args={[0.14, 0.13, 8.55]} />
                            <meshStandardMaterial color="#c4b38c" />
                        </mesh>
                        {Array.from({ length: 16 }, (_, i) => (
                            <mesh
                                key={i}
                                position={[a * 4.515, -0.34, i * 0.5 - 3.75]}
                                rotation={[0, 0, Math.PI / 4]}
                            >
                                <boxGeometry args={[0.012, 0.12, 0.12]} />
                                <meshStandardMaterial
                                    color="#b2a278"
                                    metalness={0.35}
                                    roughness={0.7}
                                />
                            </mesh>
                        ))}
                    </group>
                )),
            )}
            {Array.from({ length: 64 }, (_, i) => {
                const x = i % 8,
                    y = Math.floor(i / 8),
                    h = highlights.find((h) => h.x === x && h.y === y);
                const hc =
                    h?.kind === "attack"
                        ? "#ec6d5d"
                        : h?.kind === "skill"
                          ? "#b997ff"
                          : teal;
                return (
                    <group key={i} position={[x - 3.5, 0, y - 3.5]}>
                        <mesh
                            receiveShadow
                            onClick={(e) => {
                                e.stopPropagation();
                                if (interactive) onTile(x, y);
                            }}
                            onPointerOver={() => {
                                if (interactive)
                                    document.body.style.cursor = "pointer";
                            }}
                            onPointerOut={() => {
                                document.body.style.cursor = "auto";
                            }}
                        >
                            <boxGeometry args={[0.975, 0.2, 0.975]} />
                            <meshStandardMaterial
                                color={
                                    (x + y) % 2 === 0 ? "#d1bd90" : "#8c917a"
                                }
                                roughness={0.93}
                            />
                        </mesh>
                        {h && (
                            <mesh
                                rotation={[-Math.PI / 2, 0, 0]}
                                position={[0, 0.108, 0]}
                            >
                                <planeGeometry args={[0.88, 0.88]} />
                                <meshBasicMaterial
                                    color={hc}
                                    transparent
                                    opacity={0.33}
                                />
                            </mesh>
                        )}
                        {h && (
                            <mesh
                                rotation={[-Math.PI / 2, 0, 0]}
                                position={[0, 0.113, 0]}
                            >
                                <ringGeometry args={[0.12, 0.165, 24]} />
                                <meshBasicMaterial
                                    color={hc}
                                    transparent
                                    opacity={0.9}
                                />
                            </mesh>
                        )}
                        {deployment &&
                            (homeSide === "north" ? y <= 1 : y >= 6) && (
                                <mesh
                                    rotation={[-Math.PI / 2, 0, 0]}
                                    position={[0, 0.106, 0]}
                                >
                                    <planeGeometry args={[0.96, 0.96]} />
                                    <meshBasicMaterial
                                        color={teal}
                                        transparent
                                        opacity={0.13}
                                    />
                                </mesh>
                            )}
                        {i % 7 === 0 && (
                            <mesh
                                position={[0.39, 0.106, -0.3]}
                                rotation={[-Math.PI / 2, 0, 0.3]}
                            >
                                <circleGeometry args={[0.11, 5]} />
                                <meshStandardMaterial
                                    color="#ac7c36"
                                    transparent
                                    opacity={0.55}
                                />
                            </mesh>
                        )}
                    </group>
                );
            })}
            {units.map((unit) => (
                <Pawn
                    key={unit.id}
                    unit={unit}
                    selected={selectedId === unit.id}
                    friendly={unit.owner_id === viewerId}
                    onSelect={onSelect}
                    interactive={interactive}
                />
            ))}
        </>
    );
}
export default function Battlefield(props: Props) {
    return (
        <div
            style={{
                width: "100%",
                height: "100%",
                minHeight: 0,
                position: "relative",
            }}
            aria-label="Three dimensional tactical battlefield"
        >
            <Canvas
                shadows={{ type: PCFShadowMap }}
                orthographic
                camera={{
                    position: [9, 12, 13],
                    zoom: 48,
                    near: 0.1,
                    far: 100,
                }}
                dpr={[1, 1.7]}
                gl={{ antialias: true, alpha: false }}
            >
                <Suspense fallback={null}>
                    <Scene {...props} />
                </Suspense>
            </Canvas>
        </div>
    );
}
