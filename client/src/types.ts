export type Role = "ATHLETE" | "ADMIN";

export type AthleteProfile = {
  id: string;
  userId: string;
  studentId: string;
  contactNumber: string;
  address: string;
  emergencyContact: string;
  beltRank: string;
};

export type User = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  isActive: boolean;
  profilePhoto?: string | null;
  athleteProfile?: AthleteProfile | null;
};

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

export const ACHIEVEMENT_OPTIONS = ["GOLD", "SILVER", "BRONZE", "FINALIST", "QUALIFIER"] as const;
