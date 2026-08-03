export const BELT_RANKS = [
  "White",
  "Yellow Low / Yellow",
  "Yellow High / Orange",
  "Blue Low / Green",
  "Blue High / Purple",
  "Red Low / Blue",
  "Red High / Red",
  "Brown Low / Maroon",
  "Brown High / Brown",
  "Black (1st Dan)",
  "Black (2nd Dan)",
  "Black (3rd Dan)"
] as const;

export const ACHIEVEMENT_TYPES = ["GOLD", "SILVER", "BRONZE", "FINALIST", "QUALIFIER"] as const;

export const POINTS_DEFAULT = {
  PROVINCIAL: 5,
  REGIONAL: 10,
  NATIONAL: 20,
  INTERNATIONAL: 35
} as const;
