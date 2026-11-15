// Playable characters: picked on the home screen (gender first, then a character of that gender).

export type Gender = "male" | "female";
export const GENDERS: readonly Gender[] = ["female", "male"];
export const isGender = (v: unknown): v is Gender => v === "male" || v === "female";

export interface CharacterDef {
  id: string;
  gender: Gender;
  name: string;
  /**
   * Sprite sheet under client/public/: rows top→bottom = down, left, right, up;
   * columns = walk frames (a single column means one pose per direction).
   */
  sheet: string;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  /** Column used when standing still. */
  standColumn: number;
  /** Row just below the feet in every frame (the sprite is anchored there). */
  feetRow: number;
  /** Height of the body in sheet pixels (used to draw every character at the same on-screen height). */
  bodyHeight: number;
}

export const CHARACTERS: CharacterDef[] = [
  {
    id: "female",
    gender: "female",
    name: "Cô nông dân",
    sheet: "assets/characters/female.png",
    frameWidth: 32,
    frameHeight: 32,
    columns: 1,
    standColumn: 0,
    feetRow: 24,
    bodyHeight: 20,
  },
  {
    id: "maid",
    gender: "female",
    name: "Cô hầu gái",
    sheet: "assets/characters/maid.png", // built by client/assets-src/characters/build_maid.py
    frameWidth: 40,
    frameHeight: 72,
    columns: 3,
    standColumn: 1,
    feetRow: 71,
    bodyHeight: 60,
  },
  {
    id: "male",
    gender: "male",
    name: "Anh nông dân",
    sheet: "assets/characters/male.png",
    frameWidth: 32,
    frameHeight: 32,
    columns: 1,
    standColumn: 0,
    feetRow: 24,
    bodyHeight: 20,
  },
];

export const getCharacter = (id: unknown): CharacterDef | undefined => CHARACTERS.find((c) => c.id === id);
export const charactersOf = (gender: Gender) => CHARACTERS.filter((c) => c.gender === gender);
export const defaultCharacterOf = (gender: Gender): CharacterDef => charactersOf(gender)[0];
