import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import path from "node:path";
import { config } from "./config.js";
import { errorHandler } from "./middlewares/error.js";
import { authRouter } from "./routes/auth.js";
import { meRouter } from "./routes/me.js";
import { usersRouter } from "./routes/users.js";
import { eventsRouter } from "./routes/events.js";
import { tournamentsRouter } from "./routes/tournaments.js";
import { analyticsRouter } from "./routes/analytics.js";
import { rankingsRouter } from "./routes/rankings.js";
import { reportsRouter } from "./routes/reports.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { chatRouter } from "./routes/chat.js";
import { pushRouter } from "./routes/push.js";

const app = express();

// Keep health lightweight and always reachable, even if other middleware fails.
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }

    const isConfigured = config.clientOrigins.includes(origin);
    const isLocalhostDev = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(origin);

    if (isConfigured || isLocalhostDev) {
      callback(null, true);
      return;
    }

    callback(new Error("Not allowed by CORS"));
  }
}));
app.use(morgan("dev"));
app.use(express.json({ limit: "2mb" }));
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.use("/api/auth", authRouter);
app.use("/api/me", meRouter);
app.use("/api/users", usersRouter);
app.use("/api/events", eventsRouter);
app.use("/api/tournaments", tournamentsRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/rankings", rankingsRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/chat", chatRouter);
app.use("/api/push", pushRouter);

app.use(errorHandler);

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Server running on http://localhost:${config.port}`);
});
