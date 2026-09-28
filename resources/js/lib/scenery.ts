export type HomeSide = "north" | "south";
export type WorldPoint = readonly [number, number, number];

/** Host-authored castle on the far north horizon (audit L482–539). */
export const CASTLE_POSITION = [-0.5, -0.68, -9.5] as const;
export const CASTLE_ROTATION_Y = 0.12;

/** Host-authored cloud banks on the same far horizon (audit L585–605). */
export const CLOUD_POSITIONS = [
    [-12, 6, -15],
    [-4, 8, -19],
    [8, 7, -17],
] as const;

/**
 * Host-authored scenery sits on the negative-Z horizon. From the guest
 * (north) camera that is the near side of the board, so those meshes
 * occupy the foreground. A 180° yaw around the board puts them back
 * on the far horizon for that viewer.
 */
export function sceneryPlacement(
    position: WorldPoint,
    homeSide: HomeSide,
    rotationY = 0,
): { position: [number, number, number]; rotationY: number } {
    if (homeSide === "south") {
        return {
            position: [position[0], position[1], position[2]],
            rotationY,
        };
    }

    return {
        position: [-position[0], position[1], -position[2]],
        rotationY: rotationY + Math.PI,
    };
}

/** True when a world point sits on the viewer's near side of the board. */
export function sceneryInForeground(
    position: WorldPoint,
    homeSide: HomeSide,
): boolean {
    return homeSide === "south" ? position[2] > 0 : position[2] < 0;
}
