import nodemailer from "nodemailer";
import { config } from "../config.js";

const isMailerConfigured = Boolean(config.mail.host && config.mail.user && config.mail.password && config.mail.from);

const transporter = isMailerConfigured
  ? nodemailer.createTransport({
      host: config.mail.host,
      port: config.mail.port,
      secure: config.mail.secure,
      auth: {
        user: config.mail.user,
        pass: config.mail.password
      }
    })
  : null;

export async function sendCoachVerificationEmail(recipients: string[], athleteName: string, athleteEmail: string) {
  if (!transporter || recipients.length === 0) return false;

  await transporter.sendMail({
    from: config.mail.from,
    to: recipients,
    subject: "New athlete registration pending verification",
    text: [
      "A new athlete registration is waiting for your verification.",
      `Athlete: ${athleteName}`,
      `Email: ${athleteEmail}`,
      "Please review the account in the coach admin panel and verify it when ready."
    ].join("\n")
  });

  return true;
}