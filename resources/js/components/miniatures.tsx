import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Group } from "three";

type P = { id: string; color: string; enemy?: boolean };
const gold = "#dbb76b",
    steel = "#9baeb5",
    dark = "#27323e",
    skin = "#d4ab81";
function Part({
    p = [0, 0, 0],
    s = [1, 1, 1],
    color = steel,
    r = [0, 0, 0],
}: {
    p?: [number, number, number];
    s?: [number, number, number];
    color?: string;
    r?: [number, number, number];
}) {
    return (
        <mesh position={p} scale={s} rotation={r} castShadow receiveShadow>
            <boxGeometry />
            <meshStandardMaterial
                color={color}
                roughness={0.55}
                metalness={color === steel || color === gold ? 0.55 : 0.05}
            />
        </mesh>
    );
}
function Orb({
    p,
    size,
    color,
    glow = false,
}: {
    p: [number, number, number];
    size: number;
    color: string;
    glow?: boolean;
}) {
    return (
        <mesh position={p} castShadow>
            <icosahedronGeometry args={[size, 1]} />
            <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={glow ? 1.7 : 0}
                roughness={0.65}
            />
        </mesh>
    );
}
function Staff({
    color = gold,
    orb = "#69d7ec",
    type = "orb",
}: {
    color?: string;
    orb?: string;
    type?: string;
}) {
    return (
        <group position={[0.29, 0.1, 0.01]}>
            <Part p={[0, 0.47, 0]} s={[0.035, 0.96, 0.035]} color={color} />
            {type === "spear" ? (
                <mesh position={[0, 1, 0]}>
                    <coneGeometry args={[0.09, 0.29, 4]} />
                    <meshStandardMaterial
                        color={steel}
                        metalness={0.65}
                        roughness={0.35}
                    />
                </mesh>
            ) : (
                <>
                    <Orb p={[0, 0.99, 0]} size={0.11} color={orb} glow />
                    <mesh
                        position={[0, 0.99, 0]}
                        rotation={[Math.PI / 2, 0, 0]}
                    >
                        <torusGeometry args={[0.16, 0.02, 5, 12]} />
                        <meshStandardMaterial color={gold} />
                    </mesh>
                </>
            )}
        </group>
    );
}
function Sword({
    big = false,
    color = steel,
}: {
    big?: boolean;
    color?: string;
}) {
    return (
        <group position={[0.3, 0.47, -0.04]} rotation={[0.25, 0, -0.2]}>
            <Part
                p={[0, 0.24, 0]}
                s={[big ? 0.1 : 0.055, 0.52, 0.025]}
                color={color}
            />
            <Part s={[0.21, 0.035, 0.065]} color={gold} />
            <Part p={[0, -0.07, 0]} s={[0.04, 0.15, 0.04]} color={dark} />
        </group>
    );
}
function Shield({ color, large = false }: { color: string; large?: boolean }) {
    return (
        <group position={[-0.29, 0.47, -0.07]} rotation={[0, -0.22, 0.06]}>
            <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry
                    args={[
                        large ? 0.23 : 0.17,
                        large ? 0.23 : 0.17,
                        0.065,
                        large ? 6 : 12,
                    ]}
                />
                <meshStandardMaterial color={gold} />
            </mesh>
            <mesh rotation={[0, Math.PI, 0]} position={[0, 0, -0.04]}>
                <circleGeometry
                    args={[large ? 0.205 : 0.145, large ? 6 : 12]}
                />
                <meshStandardMaterial color={color} />
            </mesh>
            <Part p={[0, 0, -0.045]} s={[0.035, 0.25, 0.03]} color={gold} />
        </group>
    );
}
export default function Miniature({ id, color, enemy }: P) {
    const body = useRef<Group>(null);
    useFrame(({ clock }) => {
        if (body.current)
            body.current.position.y =
                Math.sin(clock.elapsedTime * 1.8 + id.length) * 0.009;
    });
    const magic = [
        "arcanist",
        "cleric",
        "pyromancer",
        "frostweaver",
        "druid",
    ].includes(id);
    const palette: Record<string, string> = {
        warden: "#345764",
        knight: "#43627b",
        ranger: "#426047",
        arcanist: "#66519b",
        cleric: "#e8ddbf",
        rogue: "#4d3f62",
        pikeman: "#697776",
        herald: "#943f4b",
        pyromancer: "#b64527",
        frostweaver: "#76bdcb",
        druid: "#62783a",
        revenant: "#3c4650",
    };
    const cloth = palette[id] || color;
    const hood = ["ranger", "rogue", "druid", "revenant"].includes(id);
    return (
        <group rotation={[0, enemy ? Math.PI : 0, 0]}>
            <mesh position={[0, 0.045, 0]} receiveShadow castShadow>
                <cylinderGeometry args={[0.32, 0.35, 0.09, 20]} />
                <meshStandardMaterial color={dark} />
            </mesh>
            <mesh position={[0, 0.094, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.29, 0.027, 5, 24]} />
                <meshStandardMaterial
                    color={color}
                    emissive={color}
                    emissiveIntensity={0.3}
                />
            </mesh>
            <group ref={body}>
                <Part
                    p={[-0.09, 0.21, 0]}
                    s={[0.12, 0.25, 0.16]}
                    color={dark}
                />
                <Part p={[0.09, 0.21, 0]} s={[0.12, 0.25, 0.16]} color={dark} />
                <mesh position={[0, 0.4, 0.025]} castShadow>
                    <coneGeometry
                        args={[magic ? 0.23 : 0.19, 0.5, magic ? 8 : 6]}
                    />
                    <meshStandardMaterial color={cloth} />
                </mesh>
                <Part
                    p={[0, 0.53, 0]}
                    s={[0.3, 0.28, 0.19]}
                    color={magic || hood || id === "herald" ? cloth : steel}
                />
                <Part
                    p={[0, 0.43, -0.105]}
                    s={[0.31, 0.045, 0.025]}
                    color={gold}
                />
                <Part
                    p={[0, 0.49, 0.135]}
                    s={[0.31, 0.45, 0.035]}
                    color={cloth}
                    r={[-0.15, 0, 0]}
                />
                <Part
                    p={[-0.2, 0.53, 0]}
                    s={[0.12, 0.24, 0.16]}
                    color={cloth}
                    r={[0, 0, -0.18]}
                />
                <Part
                    p={[0.2, 0.53, 0]}
                    s={[0.12, 0.24, 0.16]}
                    color={cloth}
                    r={[0, 0, 0.18]}
                />
                <Orb
                    p={[0, 0.76, -0.015]}
                    size={0.145}
                    color={id === "revenant" ? "#b6c2bd" : skin}
                />
                {hood ? (
                    <mesh position={[0, 0.8, 0.025]} castShadow>
                        <sphereGeometry
                            args={[
                                0.17,
                                8,
                                6,
                                0,
                                Math.PI * 2,
                                0,
                                Math.PI * 0.65,
                            ]}
                        />
                        <meshStandardMaterial color={cloth} />
                    </mesh>
                ) : magic ? (
                    <mesh position={[0, 0.925, 0.025]} castShadow>
                        <coneGeometry
                            args={[0.18, id === "arcanist" ? 0.34 : 0.19, 8]}
                        />
                        <meshStandardMaterial color={cloth} />
                    </mesh>
                ) : (
                    <>
                        <mesh position={[0, 0.81, 0]} castShadow>
                            <sphereGeometry
                                args={[
                                    0.155,
                                    8,
                                    6,
                                    0,
                                    Math.PI * 2,
                                    0,
                                    Math.PI * 0.6,
                                ]}
                            />
                            <meshStandardMaterial
                                color={steel}
                                metalness={0.6}
                                roughness={0.4}
                            />
                        </mesh>
                        <Part
                            p={[0, 0.76, -0.143]}
                            s={[0.035, 0.16, 0.035]}
                            color={gold}
                        />
                    </>
                )}
                <Part
                    p={[-0.053, 0.775, -0.137]}
                    s={[0.034, 0.017, 0.018]}
                    color={id === "revenant" ? "#7bffd3" : dark}
                />
                <Part
                    p={[0.053, 0.775, -0.137]}
                    s={[0.034, 0.017, 0.018]}
                    color={id === "revenant" ? "#7bffd3" : dark}
                />
                {id === "warden" && (
                    <>
                        <Shield color={cloth} large />
                        <Sword big />
                        <Part
                            p={[-0.18, 0.665, 0]}
                            s={[0.19, 0.12, 0.25]}
                            color={gold}
                        />
                    </>
                )}
                {id === "knight" && (
                    <>
                        <Shield color={cloth} />
                        <Sword big />
                        <Part
                            p={[0, 0.98, 0.015]}
                            s={[0.045, 0.2, 0.19]}
                            color="#b34448"
                        />
                    </>
                )}
                {id === "pikeman" && (
                    <>
                        <Staff type="spear" />
                        <Part
                            p={[-0.21, 0.64, 0]}
                            s={[0.15, 0.12, 0.23]}
                            color={steel}
                        />
                    </>
                )}
                {id === "ranger" && (
                    <group
                        position={[0.3, 0.58, -0.02]}
                        rotation={[0, Math.PI / 2, 0]}
                    >
                        <mesh>
                            <torusGeometry
                                args={[0.29, 0.026, 5, 16, Math.PI]}
                            />
                            <meshStandardMaterial color="#af8553" />
                        </mesh>
                        <Part
                            p={[0, 0, 0]}
                            s={[0.012, 0.6, 0.012]}
                            color="#ddd0b2"
                            r={[0, 0, Math.PI / 2]}
                        />
                        <Part
                            p={[0, 0, -0.025]}
                            s={[0.035, 0.035, 0.52]}
                            color={gold}
                        />
                    </group>
                )}
                {id === "rogue" && (
                    <>
                        <Sword />
                        <group position={[-0.58, 0, 0]}>
                            <Sword />
                        </group>
                    </>
                )}
                {id === "herald" && (
                    <>
                        <Staff type="spear" />
                        <Part
                            p={[0.44, 0.97, 0.02]}
                            s={[0.3, 0.34, 0.028]}
                            color={cloth}
                        />
                        <Part
                            p={[0.45, 0.98, -0.005]}
                            s={[0.04, 0.2, 0.025]}
                            color={gold}
                        />
                    </>
                )}
                {id === "arcanist" && <Staff orb="#b993ff" />}
                {id === "cleric" && (
                    <>
                        <Staff orb="#ffecab" />
                        <Part
                            p={[0, 0.58, -0.115]}
                            s={[0.15, 0.045, 0.025]}
                            color={gold}
                        />
                        <Part
                            p={[0, 0.58, -0.125]}
                            s={[0.045, 0.18, 0.025]}
                            color={gold}
                        />
                    </>
                )}
                {id === "pyromancer" && (
                    <>
                        <Staff orb="#ff702f" />
                        <Orb
                            p={[-0.29, 0.64, -0.06]}
                            size={0.13}
                            color="#ffbc45"
                            glow
                        />
                    </>
                )}
                {id === "frostweaver" && (
                    <>
                        <Staff color={steel} orb="#73efff" />
                        {[-1, 1].map((a) => (
                            <mesh
                                key={a}
                                position={[a * 0.16, 0.92, 0]}
                                rotation={[0, 0, a * -0.4]}
                            >
                                <coneGeometry args={[0.045, 0.24, 4]} />
                                <meshStandardMaterial
                                    color="#b1edf7"
                                    metalness={0.3}
                                    roughness={0.2}
                                />
                            </mesh>
                        ))}
                    </>
                )}
                {id === "druid" && (
                    <>
                        <Staff color="#8a6547" orb="#b7db62" />
                        {[-1, 1].map((a) => (
                            <group key={a}>
                                <Part
                                    p={[a * 0.16, 0.96, 0.02]}
                                    s={[0.035, 0.3, 0.035]}
                                    color="#c8b48c"
                                    r={[0, 0, a * -0.4]}
                                />
                                <Part
                                    p={[a * 0.21, 1.04, 0.02]}
                                    s={[0.13, 0.03, 0.03]}
                                    color="#c8b48c"
                                />
                            </group>
                        ))}
                    </>
                )}
                {id === "revenant" && (
                    <>
                        <Sword big color="#8be6bd" />
                        <Part
                            p={[-0.19, 0.665, 0]}
                            s={[0.18, 0.15, 0.23]}
                            color={dark}
                        />
                        <Orb
                            p={[0, 0.57, -0.125]}
                            size={0.055}
                            color="#75f5b9"
                            glow
                        />
                    </>
                )}
            </group>
        </group>
    );
}
