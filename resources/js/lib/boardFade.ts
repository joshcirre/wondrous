export type FadeUnit = { id: string; x: number; y: number; hp?: number };

export type CameraPoint = { x: number; y: number; z: number };

function tileWorld(x: number, y: number): { x: number; z: number } {
    return { x: x - 3.5, z: y - 3.5 };
}

function betweenCameraAndTarget(
    camera: CameraPoint,
    unit: { x: number; z: number },
    target: { x: number; z: number },
): boolean {
    const toTarget = { x: target.x - camera.x, z: target.z - camera.z };
    const toUnit = { x: unit.x - camera.x, z: unit.z - camera.z };
    const lengthSq = toTarget.x * toTarget.x + toTarget.z * toTarget.z;
    if (lengthSq <= 0) {
        return false;
    }
    const projection = (toUnit.x * toTarget.x + toUnit.z * toTarget.z) / lengthSq;
    if (projection <= 0.02 || projection >= 0.98) {
        return false;
    }
    const closest = {
        x: camera.x + toTarget.x * projection,
        z: camera.z + toTarget.z * projection,
    };
    const dx = unit.x - closest.x;
    const dz = unit.z - closest.z;
    return Math.sqrt(dx * dx + dz * dz) < 1.1;
}

export function fadedUnitIds(args: {
    hover: { x: number; y: number } | null;
    units: FadeUnit[];
    camera: CameraPoint;
}): string[] {
    if (!args.hover) {
        return [];
    }
    const target = tileWorld(args.hover.x, args.hover.y);
    return args.units
        .filter((unit) => (unit.hp ?? 1) > 0)
        .filter(
            (unit) =>
                !(unit.x === args.hover!.x && unit.y === args.hover!.y) &&
                betweenCameraAndTarget(
                    args.camera,
                    tileWorld(unit.x, unit.y),
                    target,
                ),
        )
        .map((unit) => unit.id);
}

export function cameraForHome(homeSide: "north" | "south"): CameraPoint {
    return homeSide === "north" ? { x: -9, y: 12, z: -13 } : { x: 9, y: 12, z: 13 };
}
