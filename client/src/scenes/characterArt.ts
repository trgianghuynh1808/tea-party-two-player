// Character sprite sheets (players and customers): layout is described by CHARACTERS (shared/src/characters.ts).
import { CHARACTERS, PLAYER_RADIUS, getCharacter } from "@boba/shared";

/** Every character is drawn with its body this tall on screen. */
export const CHARACTER_BODY_PX = 60;
export const FEET_Y = PLAYER_RADIUS - 2; // feet sit near the bottom of the collision circle
export const HEAD_Y = FEET_Y - CHARACTER_BODY_PX; // top of the head / hat
export const DIRECTION_ROW: Record<string, number> = { down: 0, left: 1, right: 2, up: 3 };
/** Walk cycle over the sheet columns for multi-frame characters (step, stand, step, stand). */
export const WALK_COLUMNS = [0, 1, 2, 1];
export const WALK_FPS = 8;
export const characterKey = (id: string) => `char-${id}`;
export const characterOf = (id: string) => getCharacter(id) ?? CHARACTERS[0];
