import dotenv from "dotenv";

dotenv.config();

const rawClientOrigins =
  process.env.CLIENT_ORIGIN ?? "http://localhost:5173,http://localhost:5174,https://ubtkdmis.github.io";
const clientOrigins = rawClientOrigins
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const config = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL ?? "file:./dev.db",
  jwtSecret: process.env.JWT_SECRET ?? "change-me",
  clientOrigins,
  mail: {
    host: process.env.SMTP_HOST ?? "",
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: (process.env.SMTP_SECURE ?? "false") === "true",
    user: process.env.SMTP_USER ?? "",
    password: process.env.SMTP_PASSWORD ?? "",
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER ?? ""
  },
  vapid: {
    publicKey:  process.env.VAPID_PUBLIC_KEY  ?? "",
    privateKey: process.env.VAPID_PRIVATE_KEY ?? "",
    subject:    process.env.VAPID_SUBJECT     ?? "mailto:admin@example.com"
  }
};
