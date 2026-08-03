import jwt from "jsonwebtoken";
import { config } from "../config.js";

type TokenPayload = {
  sub: string;
  role: "ATHLETE" | "ADMIN";
};

export function signAuthToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: "7d" });
}

export function verifyAuthToken(token: string): TokenPayload {
  return jwt.verify(token, config.jwtSecret) as TokenPayload;
}
