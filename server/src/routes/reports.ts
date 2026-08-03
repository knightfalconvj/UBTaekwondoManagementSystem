import { Router } from "express";
import PDFDocument from "pdfkit";
import type { Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type RequestWithUser } from "../middlewares/auth.js";

function createPdfResponse(
  res: Response,
  filename: string,
  options?: PDFKit.PDFDocumentOptions
): PDFKit.PDFDocument {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename=\"${filename}\"`);
  const doc = new PDFDocument({ margin: 50, ...(options ?? {}) });
  doc.info = {
    ...doc.info,
    Author: "knightfalconvj",
    Creator: "UB Taekwondo Management Information System",
    Producer: "UB Taekwondo Management Information System",
    Subject: "Digitally signed by knightfalconvj",
    Keywords: "signature,knightfalconvj,ownership"
  };
  doc.pipe(res);
  return doc;
}

const dashboardQuerySchema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  eventType: z.enum(["TRAINING", "TOURNAMENT", "TEAM_EVENT"]).optional(),
  warningOnly: z.enum(["true", "false"]).optional()
});

const getConsecutiveAbsences = async (userId: string) => {
  const records = await prisma.attendance.findMany({
    where: { userId },
    include: { event: true },
    orderBy: [{ event: { date: "desc" } }, { createdAt: "desc" }]
  });

  let streak = 0;
  for (const record of records) {
    if (record.present) break;
    streak += 1;
  }

  return streak;
};

type ChartDatum = {
  label: string;
  value: number;
  color: string;
};

type TableColumn = {
  label: string;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  flex?: number;
};

const chartPalette = [
  "#f4c430", // golden yellow (priority)
  "#4169e1", // royal blue (priority)
  "#dc2626", // red (priority)
  "#0b2e59", // UB navy
  "#334155", // slate neutral
  "#0f766e", // teal accent
  "#7c3aed", // violet accent
  "#b45309" // amber brown
];

const medalColorMap: Record<string, string> = {
  GOLD: "#d4af37",
  SILVER: "#c0c0c0",
  BRONZE: "#cd7f32"
};

function getCategoryColor(label: string, fallbackIndex: number): string {
  const normalized = label.trim().toUpperCase();
  return medalColorMap[normalized] ?? chartPalette[fallbackIndex % chartPalette.length];
}

function ensurePdfSpace(doc: PDFKit.PDFDocument, requiredHeight: number): void {
  const bottomLimit = doc.page.height - doc.page.margins.bottom;
  if (doc.y + requiredHeight > bottomLimit) {
    doc.addPage();
  }
}

function drawBarChart(doc: PDFKit.PDFDocument, title: string, data: ChartDatum[], maxItems = 8): void {
  const filtered = data.filter((item) => item.value > 0).slice(0, maxItems);
  const left = doc.page.margins.left;
  const chartWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const labelWidth = Math.min(180, chartWidth * 0.36);
  const valueWidth = 48;
  const barAreaWidth = chartWidth - labelWidth - valueWidth - 12;
  const barX = left + labelWidth;

  ensurePdfSpace(doc, 42);
  doc.font("Helvetica-Bold").fontSize(12).fillColor("#0f2e66").text(title, barX, doc.y, {
    width: barAreaWidth,
    align: "center"
  });
  doc.moveDown(0.3);

  if (filtered.length === 0) {
    doc.font("Helvetica").fontSize(10).fillColor("#64748b").text("No statistical data available.");
    doc.fillColor("#000000");
    doc.moveDown(0.5);
    return;
  }

  const barHeight = 12;
  const rowGap = 8;
  const maxValue = Math.max(...filtered.map((item) => item.value), 1);

  filtered.forEach((item) => {
    ensurePdfSpace(doc, barHeight + rowGap + 2);
    const y = doc.y;

    doc.font("Helvetica").fontSize(9).fillColor("#1f2937").text(item.label, left, y + 1, { width: labelWidth - 6 });

    const barX = left + labelWidth;
    const barY = y;
    const fillWidth = Math.max(2, (item.value / maxValue) * barAreaWidth);

    doc.rect(barX, barY, barAreaWidth, barHeight).fill("#e5eaf3");
    doc.rect(barX, barY, fillWidth, barHeight).fill(item.color);

    doc.font("Helvetica-Bold").fontSize(9).fillColor("#334155").text(String(item.value), barX + barAreaWidth + 6, y + 1, {
      width: valueWidth,
      align: "left"
    });

    doc.y = y + barHeight + rowGap;
  });

  doc.fillColor("#000000");
  doc.moveDown(0.3);
}

function drawReportHeader(doc: PDFKit.PDFDocument, title: string, subtitle?: string): void {
  doc.font("Helvetica-Bold").fontSize(19).fillColor("#0f2e66").text(title, { align: "center" });
  if (subtitle) {
    doc.font("Helvetica").fontSize(11).fillColor("#475569").text(subtitle, { align: "center" });
  }

  doc.moveDown(0.35);
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const y = doc.y;
  doc.moveTo(left, y).lineTo(right, y).lineWidth(1).strokeColor("#d6deeb").stroke();
  doc.moveDown(0.8);
  doc.fillColor("#000000");
}

function drawSectionTitle(doc: PDFKit.PDFDocument, title: string): void {
  ensurePdfSpace(doc, 28);
  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const y = doc.y;

  doc.roundedRect(left, y, width, 20, 4).fill("#eef4ff");
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#163a74").text(title, left + 8, y + 5, {
    width: width - 16
  });

  doc.y = y + 24;
  doc.fillColor("#000000");
}

function drawKeyValueRows(
  doc: PDFKit.PDFDocument,
  rows: Array<{ label: string; value: string | number }>
): void {
  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  rows.forEach((row, index) => {
    ensurePdfSpace(doc, 20);
    const y = doc.y;

    if (index % 2 === 0) {
      doc.roundedRect(left, y - 1, width, 17, 3).fill("#f8fbff");
    }

    doc.font("Helvetica-Bold").fontSize(10).fillColor("#334155").text(`${row.label}:`, left + 8, y, { width: 132 });
    doc.font("Helvetica").fontSize(10).fillColor("#111827").text(String(row.value), left + 142, y, {
      width: width - 150
    });
    doc.y = y + 18;
  });

  doc.moveDown(0.3);
  doc.fillColor("#000000");
}

function drawTable(
  doc: PDFKit.PDFDocument,
  title: string,
  columns: TableColumn[],
  rows: string[][],
  options?: {
    rowHeight?: number;
    emptyMessage?: string;
    rowFill?: (row: string[], index: number) => string | undefined;
    cellColor?: (row: string[], rowIndex: number, colIndex: number) => string | undefined;
  }
): void {
  drawSectionTitle(doc, title);

  if (rows.length === 0) {
    doc.font("Helvetica").fontSize(10).fillColor("#64748b").text(options?.emptyMessage ?? "No records available.");
    doc.fillColor("#000000");
    return;
  }

  const rowHeight = options?.rowHeight ?? 18;
  const tableLeft = doc.page.margins.left;
  const tableRight = doc.page.width - doc.page.margins.right;
  const tableWidth = tableRight - tableLeft;

  const measuredColumns = columns.map((column, colIndex) => {
    const priority = column.flex ?? 1;
    const baseMinWidth = column.minWidth ?? column.width ?? 44;
    let measured = column.width ?? baseMinWidth;

    measured = Math.max(measured, String(column.label).length * 5.4 + 12);
    rows.slice(0, 150).forEach((row) => {
      const value = row[colIndex] ?? "";
      measured = Math.max(measured, String(value).length * 4.8 + 12);
    });

    const maxWidth = column.maxWidth ?? Math.max(baseMinWidth + 40, tableWidth * 0.55);
    const preferred = Math.min(measured, maxWidth);

    return {
      minWidth: baseMinWidth,
      maxWidth,
      priority,
      width: Math.max(baseMinWidth, preferred)
    };
  });

  const totalCurrent = measuredColumns.reduce((sum, column) => sum + column.width, 0);
  if (totalCurrent > tableWidth) {
    let overflow = totalCurrent - tableWidth;
    const shrinkCapacity = measuredColumns.reduce((sum, column) => {
      const capacity = Math.max(0, column.width - column.minWidth);
      return sum + capacity / Math.max(column.priority, 0.1);
    }, 0);
    if (shrinkCapacity > 0) {
      measuredColumns.forEach((column) => {
        const capacity = Math.max(0, column.width - column.minWidth);
        if (capacity === 0) return;
        const weightedCapacity = capacity / Math.max(column.priority, 0.1);
        const reduction = Math.min(capacity, (weightedCapacity / shrinkCapacity) * overflow);
        column.width -= reduction;
        overflow -= reduction;
      });
    }
  } else if (totalCurrent < tableWidth) {
    const free = tableWidth - totalCurrent;
    const growBasis = measuredColumns.reduce((sum, column) => sum + Math.max(column.priority, 0.1), 0) || 1;
    measuredColumns.forEach((column) => {
      const growth = (Math.max(column.priority, 0.1) / growBasis) * free;
      column.width = Math.min(column.maxWidth, column.width + growth);
    });

    const adjustedTotal = measuredColumns.reduce((sum, column) => sum + column.width, 0);
    const stillFree = tableWidth - adjustedTotal;
    if (stillFree > 0) {
      const fallbackBasis = measuredColumns.reduce((sum, column) => sum + column.width, 0) || 1;
      measuredColumns.forEach((column) => {
        const growth = (column.width / fallbackBasis) * stillFree;
        column.width += growth;
      });
    }
  }

  const resolvedWidths = measuredColumns.map((column) => Math.max(column.minWidth, Math.floor(column.width)));
  const diff = tableWidth - resolvedWidths.reduce((sum, width) => sum + width, 0);
  if (resolvedWidths.length > 0) {
    resolvedWidths[resolvedWidths.length - 1] += Math.floor(diff);
  }

  let currentY = doc.y;

  const drawHeader = () => {
    ensurePdfSpace(doc, rowHeight + 4);
    doc.rect(tableLeft, currentY, tableRight - tableLeft, rowHeight).fill("#eef4ff");

    doc.font("Helvetica-Bold").fontSize(8);
    let x = tableLeft;
    columns.forEach((column, colIndex) => {
      doc.fillColor("#1f3a6b");
      doc.text(column.label, x + 2, currentY + 4, { width: resolvedWidths[colIndex] - 4, ellipsis: true });
      x += resolvedWidths[colIndex];
    });

    doc.moveTo(tableLeft, currentY).lineTo(tableRight, currentY).strokeColor("#9aa5b5").stroke();
    doc.moveTo(tableLeft, currentY + rowHeight).lineTo(tableRight, currentY + rowHeight).strokeColor("#9aa5b5").stroke();
    currentY += rowHeight;
  };

  drawHeader();

  rows.forEach((row, rowIndex) => {
    const nextBottom = currentY + rowHeight;
    if (nextBottom > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      currentY = doc.page.margins.top;
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#334155").text(`${title} (continued)`, tableLeft, currentY);
      currentY += 14;
      drawHeader();
    }

    const explicitFill = options?.rowFill?.(row, rowIndex);
    if (explicitFill) {
      doc.rect(tableLeft, currentY, tableRight - tableLeft, rowHeight).fill(explicitFill);
    } else if (rowIndex % 2 === 0) {
      doc.rect(tableLeft, currentY, tableRight - tableLeft, rowHeight).fill("#fbfdff");
    }

    doc.font("Helvetica").fontSize(8);
    let x = tableLeft;
    row.forEach((value, colIndex) => {
      doc.fillColor(options?.cellColor?.(row, rowIndex, colIndex) ?? "#111827");
      doc.text(value, x + 2, currentY + 4, {
        width: resolvedWidths[colIndex] - 4,
        ellipsis: true
      });
      x += resolvedWidths[colIndex];
    });

    doc.moveTo(tableLeft, currentY + rowHeight).lineTo(tableRight, currentY + rowHeight).strokeColor("#dbe2ea").stroke();
    currentY += rowHeight;
  });

  doc.y = currentY + 4;
  doc.fillColor("#000000");
}

export const reportsRouter = Router();

reportsRouter.use(requireAuth);

reportsRouter.get("/athlete/:athleteProfileId", async (req: RequestWithUser, res) => {
  const athleteProfileId = String(req.params.athleteProfileId);
  const profile = await prisma.athleteProfile.findUnique({
    where: { id: athleteProfileId },
    include: {
      user: true,
      performanceRecords: true,
      achievements: true,
      rankingPoints: true
    }
  });

  if (!profile) {
    res.status(404).json({ message: "Athlete not found" });
    return;
  }

  if (req.authUser!.role === "ATHLETE" && profile.userId !== req.authUser!.id) {
    res.status(403).json({ message: "Forbidden" });
    return;
  }

  const doc = createPdfResponse(res, `athlete-${profile.user.fullName.replace(/\s+/g, "-")}.pdf`);
  drawReportHeader(doc, "University of Bohol Taekwondo", "Athlete Full Profile Report");

  const profilePhoto = profile.user.profilePhoto
    ? path.join(process.cwd(), profile.user.profilePhoto.replace(/^\//, ""))
    : null;
  const profilePhotoExists = profilePhoto ? fs.existsSync(profilePhoto) : false;

  if (profilePhoto && profilePhotoExists) {
    const imageSize = 100;
    const imageX = (doc.page.width - imageSize) / 2;
    const imageY = doc.y + 8;

    try {
      doc.image(profilePhoto, imageX, imageY, {
        fit: [imageSize, imageSize],
        align: "center",
        valign: "center"
      });
      doc.y = imageY + imageSize + 10;
    } catch {
      doc.moveDown(0.6);
    }
  } else {
    doc.moveDown(0.6);
  }

  doc.font("Helvetica-Bold").fontSize(13).fillColor("#0f2e66").text(profile.user.fullName, { align: "center" });
  doc.moveDown(0.8);
  doc.fillColor("#000000");

  drawSectionTitle(doc, "Athlete Information");
  drawKeyValueRows(doc, [
    { label: "Student ID", value: profile.studentId },
    { label: "Belt Rank", value: profile.beltRank },
    { label: "Contact Number", value: profile.contactNumber },
    { label: "Address", value: profile.address },
    { label: "Emergency Contact", value: profile.emergencyContact }
  ]);

  const performanceMix = profile.performanceRecords.reduce(
    (acc, record) => {
      const result = record.finalResult.toLowerCase();
      if (/win|gold|champion/.test(result)) {
        acc.wins += 1;
      } else if (/loss|defeat/.test(result)) {
        acc.losses += 1;
      } else {
        acc.other += 1;
      }
      return acc;
    },
    { wins: 0, losses: 0, other: 0 }
  );

  drawBarChart(doc, "Performance Analytics", [
    { label: "Wins/Championships", value: performanceMix.wins, color: "#16a34a" },
    { label: "Losses/Defeats", value: performanceMix.losses, color: "#dc2626" },
    { label: "Other Results", value: performanceMix.other, color: "#1d4ed8" }
  ]);

  const achievementCounts = new Map<string, number>();
  profile.achievements.forEach((achievement) => {
    achievementCounts.set(achievement.type, (achievementCounts.get(achievement.type) ?? 0) + 1);
  });

  const achievementChart = [...achievementCounts.entries()].map(([type, value], index) => ({
    label: type,
    value,
    color: getCategoryColor(type, index)
  }));
  drawBarChart(doc, "Achievement Statistics", achievementChart, 6);

  drawTable(
    doc,
    "Performance Records",
    [
      { label: "No.", width: 34, minWidth: 30, maxWidth: 42, flex: 0.3 },
      { label: "Date", width: 90, minWidth: 76, maxWidth: 96, flex: 0.8 },
      { label: "Event", width: 140, minWidth: 110, maxWidth: 170, flex: 1.4 },
      { label: "Result", width: 100, minWidth: 72, maxWidth: 115, flex: 1 },
      { label: "Coach Feedback", width: 131, minWidth: 120, maxWidth: 210, flex: 2.2 }
    ],
    profile.performanceRecords.map((record, index) => [
      String(index + 1),
      new Date(record.eventDate).toLocaleDateString(),
      record.eventName,
      record.finalResult,
      record.coachFeedback
    ]),
    { emptyMessage: "No performance records available." }
  );

  drawTable(
    doc,
    "Achievements",
    [
      { label: "No.", width: 34, minWidth: 30, maxWidth: 42, flex: 0.3 },
      { label: "Date", width: 95, minWidth: 76, maxWidth: 98, flex: 0.8 },
      { label: "Type", width: 100, minWidth: 74, maxWidth: 120, flex: 1 },
      { label: "Event", width: 266, minWidth: 170, maxWidth: 320, flex: 2.4 }
    ],
    profile.achievements.map((achievement, index) => [
      String(index + 1),
      new Date(achievement.achievedAt).toLocaleDateString(),
      achievement.type,
      achievement.eventName
    ]),
    { emptyMessage: "No achievements available." }
  );

  doc.end();
});

reportsRouter.get("/attendance", async (req: RequestWithUser, res) => {
  const where = req.authUser!.role === "ATHLETE" ? { userId: req.authUser!.id } : undefined;
  const records = await prisma.attendance.findMany({
    where,
    include: {
      user: true,
      event: true
    }
  });

  const doc = createPdfResponse(res, "attendance-summary.pdf");
  drawReportHeader(doc, "Attendance Summary Report", `Generated: ${new Date().toLocaleString()}`);

  const presentCount = records.filter((record) => record.present).length;
  const absentCount = records.length - presentCount;
  const pendingReasons = records.filter((record) => record.reasonStatus === "PENDING").length;
  const validReasons = records.filter((record) => record.reasonStatus === "VALID").length;
  const invalidReasons = records.filter((record) => record.reasonStatus === "INVALID").length;

  drawSectionTitle(doc, "Attendance Key Metrics");
  drawKeyValueRows(doc, [
    { label: "Total Records", value: records.length },
    { label: "Present", value: presentCount },
    { label: "Absent", value: absentCount },
    {
      label: "Attendance Rate",
      value: records.length === 0 ? "0%" : `${Number(((presentCount / records.length) * 100).toFixed(2))}%`
    }
  ]);

  drawBarChart(doc, "Attendance Overview", [
    { label: "Present", value: presentCount, color: "#16a34a" },
    { label: "Absent", value: absentCount, color: "#dc2626" }
  ]);

  drawBarChart(doc, "Reason Review Statistics", [
    { label: "Pending Reasons", value: pendingReasons, color: "#f59e0b" },
    { label: "Valid Reasons", value: validReasons, color: "#2563eb" },
    { label: "Invalid Reasons", value: invalidReasons, color: "#dc2626" }
  ]);

  drawTable(
    doc,
    "Detailed Attendance Entries",
    [
      { label: "No.", width: 34, minWidth: 30, maxWidth: 42, flex: 0.3 },
      { label: "Athlete", width: 120, minWidth: 100, maxWidth: 170, flex: 1.6 },
      { label: "Event", width: 180, minWidth: 130, maxWidth: 220, flex: 2 },
      { label: "Date", width: 90, minWidth: 76, maxWidth: 94, flex: 0.7 },
      { label: "Status", width: 70, minWidth: 62, maxWidth: 84, flex: 0.7 }
    ],
    records.map((record, index) => [
      String(index + 1),
      record.user.fullName,
      record.event.title,
      new Date(record.event.date).toLocaleDateString(),
      record.present ? "Present" : "Absent"
    ]),
    {
      emptyMessage: "No attendance records available.",
      rowFill: (row) => (row[4] === "Absent" ? "#fff7ed" : undefined)
    }
  );
  doc.end();
});

reportsRouter.get("/attendance-dashboard", async (req: RequestWithUser, res, next) => {
  try {
    if (req.authUser!.role !== "ADMIN") {
      res.status(403).json({ message: "Admin access only" });
      return;
    }

    const query = dashboardQuerySchema.parse(req.query);
    const dateFrom = query.dateFrom ? new Date(query.dateFrom) : undefined;
    const dateTo = query.dateTo ? new Date(query.dateTo) : undefined;
    const eventDateFilter = {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lte: dateTo } : {})
    };

    const attendanceWhere = {
      ...(query.eventType ? { event: { type: query.eventType } } : {}),
      ...(dateFrom || dateTo
        ? {
            event: {
              ...(query.eventType ? { type: query.eventType } : {}),
              date: eventDateFilter
            }
          }
        : {})
    };

    const athletes = await prisma.user.findMany({
      where: { role: "ATHLETE", isActive: true },
      include: {
        athleteProfile: true,
        attendances: {
          where: attendanceWhere,
          include: {
            event: { select: { date: true } }
          },
          orderBy: [{ event: { date: "desc" } }, { createdAt: "desc" }]
        }
      },
      orderBy: { fullName: "asc" }
    });

    const rows = await Promise.all(athletes.map(async (athlete) => {
      const total = athlete.attendances.length;
      const present = athlete.attendances.filter((item) => item.present).length;
      const absences = total - present;
      const attendanceRate = total === 0 ? 0 : Number(((present / total) * 100).toFixed(2));
      const pendingReasons = athlete.attendances.filter((item) => item.reasonStatus === "PENDING").length;
      const validReasons = athlete.attendances.filter((item) => item.reasonStatus === "VALID").length;
      const invalidReasons = athlete.attendances.filter((item) => item.reasonStatus === "INVALID").length;
      const consecutiveAbsences = await getConsecutiveAbsences(athlete.id);
      const warning = consecutiveAbsences >= 3;

      return {
        athleteId: athlete.id,
        fullName: athlete.fullName,
        beltRank: athlete.athleteProfile?.beltRank ?? "",
        total,
        present,
        absences,
        attendanceRate,
        pendingReasons,
        validReasons,
        invalidReasons,
        consecutiveAbsences,
        warning
      };
    }));

    const filteredRows = query.warningOnly === "true" ? rows.filter((item) => item.warning) : rows;
    const totals = filteredRows.reduce((acc, row) => {
      acc.totalSessions += row.total;
      acc.totalPresent += row.present;
      acc.totalAbsences += row.absences;
      acc.warnedAthletes += row.warning ? 1 : 0;
      acc.pendingReasons += row.pendingReasons;
      acc.validReasons += row.validReasons;
      acc.invalidReasons += row.invalidReasons;
      return acc;
    }, {
      totalSessions: 0,
      totalPresent: 0,
      totalAbsences: 0,
      warnedAthletes: 0,
      pendingReasons: 0,
      validReasons: 0,
      invalidReasons: 0
    });

    const doc = createPdfResponse(
      res,
      `attendance-dashboard-${new Date().toISOString().slice(0, 10)}.pdf`,
      { layout: "landscape" }
    );
    drawReportHeader(doc, "Coach Attendance Dashboard Report", `Generated: ${new Date().toLocaleString()}`);

    drawSectionTitle(doc, "Applied Filters");
    drawKeyValueRows(doc, [
      { label: "Date From", value: query.dateFrom ?? "ALL" },
      { label: "Date To", value: query.dateTo ?? "ALL" },
      { label: "Event Type", value: query.eventType ?? "ALL" },
      { label: "Warning Only", value: query.warningOnly ?? "false" },
      { label: "Digital Signature", value: "knightfalconvj" }
    ]);

    const attendanceRate = totals.totalSessions === 0 ? 0 : Number(((totals.totalPresent / totals.totalSessions) * 100).toFixed(2));
    drawSectionTitle(doc, "Dashboard Totals");
    drawKeyValueRows(doc, [
      { label: "Total Sessions", value: totals.totalSessions },
      { label: "Total Present", value: totals.totalPresent },
      { label: "Total Absences", value: totals.totalAbsences },
      { label: "Attendance Rate", value: `${attendanceRate}%` },
      { label: "Warned Athletes", value: totals.warnedAthletes },
      { label: "Pending Reason Reviews", value: totals.pendingReasons },
      { label: "Valid Reasons", value: totals.validReasons },
      { label: "Invalid Reasons", value: totals.invalidReasons }
    ]);

    drawBarChart(doc, "Dashboard Analytics", [
      { label: "Present Sessions", value: totals.totalPresent, color: "#16a34a" },
      { label: "Absent Sessions", value: totals.totalAbsences, color: "#dc2626" },
      { label: "Warned Athletes", value: totals.warnedAthletes, color: "#f59e0b" }
    ]);

    drawBarChart(doc, "Reason Status Metrics", [
      { label: "Pending Reasons", value: totals.pendingReasons, color: "#f59e0b" },
      { label: "Valid Reasons", value: totals.validReasons, color: "#2563eb" },
      { label: "Invalid Reasons", value: totals.invalidReasons, color: "#dc2626" }
    ]);

    drawSectionTitle(doc, "Athlete Breakdown");

    if (filteredRows.length === 0) {
      doc.fontSize(10).text("No records for selected filters.");
      doc.end();
      return;
    }

    const sortedRows = [...filteredRows].sort((a, b) => b.absences - a.absences);
    drawTable(
      doc,
      "Athlete Breakdown",
      [
        { label: "No.", width: 32, minWidth: 28, maxWidth: 40, flex: 0.2 },
        { label: "Athlete", width: 160, minWidth: 120, maxWidth: 190, flex: 1.8 },
        { label: "Belt", width: 60, minWidth: 52, maxWidth: 72, flex: 0.7 },
        { label: "Tot", width: 35, minWidth: 30, maxWidth: 42, flex: 0.3 },
        { label: "Pre", width: 35, minWidth: 30, maxWidth: 42, flex: 0.3 },
        { label: "Abs", width: 35, minWidth: 30, maxWidth: 42, flex: 0.3 },
        { label: "Rate", width: 55, minWidth: 48, maxWidth: 62, flex: 0.5 },
        { label: "Consec", width: 55, minWidth: 48, maxWidth: 65, flex: 0.5 },
        { label: "Reasons", width: 190, minWidth: 150, maxWidth: 230, flex: 2.4 },
        { label: "Warn", width: 45, minWidth: 38, maxWidth: 54, flex: 0.4 }
      ],
      sortedRows.map((row, index) => [
        String(index + 1),
        row.fullName,
        row.beltRank || "-",
        String(row.total),
        String(row.present),
        String(row.absences),
        `${row.attendanceRate}%`,
        String(row.consecutiveAbsences),
        `P:${row.pendingReasons} V:${row.validReasons} I:${row.invalidReasons}`,
        row.warning ? "YES" : "NO"
      ]),
      {
        rowFill: (row) => (row[9] === "YES" ? "#fff7ed" : undefined),
        cellColor: (row, _rowIndex, colIndex) => (colIndex === 9 && row[9] === "YES" ? "#b45309" : undefined)
      }
    );

    doc.end();
  } catch (error) {
    next(error);
  }
});

reportsRouter.get("/performance", async (req: RequestWithUser, res) => {
  const where = req.authUser!.role === "ATHLETE"
    ? { athleteProfile: { userId: req.authUser!.id } }
    : undefined;

  const records = await prisma.performanceRecord.findMany({
    where,
    include: {
      athleteProfile: { include: { user: true } }
    }
  });

  const doc = createPdfResponse(res, "performance-summary.pdf");
  drawReportHeader(doc, "Performance and Tournament Summary", `Generated: ${new Date().toLocaleString()}`);

  const resultDistribution = new Map<string, number>();
  records.forEach((record) => {
    const key = record.finalResult || "Unspecified";
    resultDistribution.set(key, (resultDistribution.get(key) ?? 0) + 1);
  });

  const performanceChart = [...resultDistribution.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], index) => ({
      label,
      value,
      color: getCategoryColor(label, index)
    }));

  drawBarChart(doc, "Performance Result Analytics", performanceChart, 7);

  drawTable(
    doc,
    "Performance Records",
    [
      { label: "No.", width: 34, minWidth: 30, maxWidth: 42, flex: 0.3 },
      { label: "Athlete", width: 120, minWidth: 96, maxWidth: 165, flex: 1.6 },
      { label: "Event", width: 130, minWidth: 110, maxWidth: 170, flex: 1.5 },
      { label: "Result", width: 95, minWidth: 74, maxWidth: 120, flex: 0.9 },
      { label: "Coach Feedback", width: 116, minWidth: 110, maxWidth: 200, flex: 2.1 }
    ],
    records.map((record, index) => [
      String(index + 1),
      record.athleteProfile.user.fullName,
      record.eventName,
      record.finalResult,
      record.coachFeedback
    ]),
    { emptyMessage: "No performance records available." }
  );
  doc.end();
});

reportsRouter.get("/achievements", async (req: RequestWithUser, res) => {
  const where = req.authUser!.role === "ATHLETE"
    ? { athleteProfile: { userId: req.authUser!.id } }
    : undefined;

  const records = await prisma.achievement.findMany({
    where,
    include: {
      athleteProfile: { include: { user: true } }
    }
  });

  const doc = createPdfResponse(res, "achievement-records.pdf");
  drawReportHeader(doc, "Achievement Records", `Generated: ${new Date().toLocaleString()}`);

  const achievementsByType = new Map<string, number>();
  records.forEach((record) => {
    achievementsByType.set(record.type, (achievementsByType.get(record.type) ?? 0) + 1);
  });

  const achievementChart = [...achievementsByType.entries()]
    .map(([label, value], index) => ({
      label,
      value,
      color: getCategoryColor(label, index)
    }))
    .sort((a, b) => b.value - a.value);

  drawBarChart(doc, "Achievement Analytics by Medal Type", achievementChart, 6);

  drawTable(
    doc,
    "Achievement Entries",
    [
      { label: "No.", width: 34, minWidth: 30, maxWidth: 42, flex: 0.3 },
      { label: "Athlete", width: 130, minWidth: 100, maxWidth: 165, flex: 1.5 },
      { label: "Type", width: 95, minWidth: 72, maxWidth: 110, flex: 0.9 },
      { label: "Event", width: 148, minWidth: 120, maxWidth: 190, flex: 1.8 },
      { label: "Date", width: 88, minWidth: 76, maxWidth: 92, flex: 0.7 }
    ],
    records.map((record, index) => [
      String(index + 1),
      record.athleteProfile.user.fullName,
      record.type,
      record.eventName,
      new Date(record.achievedAt).toLocaleDateString()
    ]),
    { emptyMessage: "No achievement records available." }
  );
  doc.end();
});

reportsRouter.get("/rankings", async (_req: RequestWithUser, res) => {
  if (_req.authUser!.role !== "ADMIN") {
    res.status(403).json({ message: "Admin access only" });
    return;
  }

  const athletes = await prisma.athleteProfile.findMany({
    include: { user: true, rankingPoints: true }
  });

  const ranked = athletes
    .map((athlete) => ({
      name: athlete.user.fullName,
      points: athlete.rankingPoints.reduce((sum, p) => sum + p.points, 0)
    }))
    .sort((a, b) => b.points - a.points);

  const doc = createPdfResponse(res, "team-rankings.pdf");
  drawReportHeader(doc, "Team Rankings Report", `Generated: ${new Date().toLocaleString()}`);

  const rankingChart = ranked.slice(0, 10).map((item, index) => ({
    label: `${index + 1}. ${item.name}`,
    value: item.points,
    color: getCategoryColor(item.name, index)
  }));
  drawBarChart(doc, "Top Athlete Ranking Points", rankingChart, 10);

  drawTable(
    doc,
    "Ranking List",
    [
      { label: "No.", width: 42, minWidth: 34, maxWidth: 50, flex: 0.3 },
      { label: "Athlete", width: 308, minWidth: 220, maxWidth: 380, flex: 2.8 },
      { label: "Points", width: 145, minWidth: 90, maxWidth: 170, flex: 1 }
    ],
    ranked.map((item, index) => [String(index + 1), item.name, String(item.points)]),
    { emptyMessage: "No ranking points available." }
  );
  doc.end();
});

reportsRouter.get("/tournament/:tournamentId", async (req: RequestWithUser, res) => {
  if (req.authUser!.role !== "ADMIN") {
    res.status(403).json({ message: "Admin access only" });
    return;
  }

  const tournamentId = String(req.params.tournamentId);
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      rosters: {
        include: {
          athleteProfile: {
            include: {
              user: true
            }
          }
        },
        orderBy: {
          athleteProfile: {
            user: {
              fullName: "asc"
            }
          }
        }
      }
    }
  });

  if (!tournament) {
    res.status(404).json({ message: "Tournament not found" });
    return;
  }

  const rosterCount = tournament.rosters.length;
  const completedResults = tournament.rosters.filter((roster) => roster.result?.trim()).length;
  const pendingResults = rosterCount - completedResults;
  const winCount = tournament.rosters.filter((roster) => /win|gold|champion/i.test(roster.result ?? "")).length;

  const beltRankCounts = new Map<string, number>();
  const resultCounts = new Map<string, number>();
  tournament.rosters.forEach((roster) => {
    const beltRank = roster.athleteProfile.beltRank || "Unspecified";
    beltRankCounts.set(beltRank, (beltRankCounts.get(beltRank) ?? 0) + 1);

    const result = roster.result?.trim() || "Pending Result";
    resultCounts.set(result, (resultCounts.get(result) ?? 0) + 1);
  });

  const achievements = await prisma.achievement.findMany({
    where: {
      eventName: tournament.name,
      achievedAt: tournament.date
    },
    include: {
      athleteProfile: {
        include: {
          user: true
        }
      }
    }
  });

  const medalCounts = new Map<string, number>();
  achievements.forEach((achievement) => {
    medalCounts.set(achievement.type, (medalCounts.get(achievement.type) ?? 0) + 1);
  });

  const defaultPointsByLevel = {
    PROVINCIAL: 10,
    REGIONAL: 20,
    NATIONAL: 35,
    INTERNATIONAL: 50
  } as const;

  const athletePoints = tournament.rosters
    .filter((roster) => roster.result?.trim())
    .map((roster, index) => ({
      label: roster.athleteProfile.user.fullName,
      value: defaultPointsByLevel[tournament.level],
      color: getCategoryColor(roster.athleteProfile.user.fullName, index)
    }));

  const doc = createPdfResponse(
    res,
    `tournament-${tournament.name.replace(/\s+/g, "-").toLowerCase()}.pdf`
  );

  drawReportHeader(doc, "Tournament Report", `${tournament.name} | ${new Date(tournament.date).toLocaleDateString()}`);

  drawSectionTitle(doc, "Tournament Information");
  drawKeyValueRows(doc, [
    { label: "Tournament Name", value: tournament.name },
    { label: "Level", value: tournament.level },
    { label: "Date", value: new Date(tournament.date).toLocaleDateString() },
    { label: "Venue", value: tournament.venue }
  ]);

  drawSectionTitle(doc, "Tournament Summary Metrics");
  drawKeyValueRows(doc, [
    { label: "Total Rostered Athletes", value: rosterCount },
    { label: "Completed Results", value: completedResults },
    { label: "Pending Results", value: pendingResults },
    {
      label: "Result Completion Rate",
      value: rosterCount === 0 ? "0%" : `${Number(((completedResults / rosterCount) * 100).toFixed(2))}%`
    },
    { label: "Win/Champion Results", value: winCount },
    { label: "Recorded Achievements", value: achievements.length }
  ]);

  drawBarChart(doc, "Result Submission Status", [
    { label: "Completed Results", value: completedResults, color: "#16a34a" },
    { label: "Pending Results", value: pendingResults, color: "#f59e0b" },
    { label: "Win/Champion Results", value: winCount, color: "#1d4ed8" }
  ]);

  const resultChart = [...resultCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], index) => ({
      label,
      value,
      color: getCategoryColor(label, index)
    }));
  drawBarChart(doc, "Result Distribution", resultChart, 8);

  const medalChart = [...medalCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], index) => ({
      label,
      value,
      color: getCategoryColor(label, index)
    }));
  drawBarChart(doc, "Medal and Achievement Analytics", medalChart, 6);

  const beltRankChart = [...beltRankCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], index) => ({
      label,
      value,
      color: getCategoryColor(label, index)
    }));
  drawBarChart(doc, "Roster by Belt Rank", beltRankChart, 8);

  drawBarChart(doc, "Estimated Points by Athlete", athletePoints, 8);

  drawTable(
    doc,
    "Roster and Result Details",
    [
      { label: "No.", width: 34, minWidth: 30, maxWidth: 42, flex: 0.3 },
      { label: "Athlete", width: 130, minWidth: 100, maxWidth: 175, flex: 1.6 },
      { label: "Belt Rank", width: 90, minWidth: 78, maxWidth: 120, flex: 1 },
      { label: "Result", width: 110, minWidth: 86, maxWidth: 130, flex: 1 },
      { label: "Coach Feedback", width: 131, minWidth: 120, maxWidth: 210, flex: 2.2 }
    ],
    tournament.rosters.map((roster, index) => [
      String(index + 1),
      roster.athleteProfile.user.fullName,
      roster.athleteProfile.beltRank,
      roster.result?.trim() || "Pending Result",
      roster.coachFeedback?.trim() || "No coach feedback recorded."
    ]),
    {
      emptyMessage: "No rostered athletes for this tournament.",
      rowFill: (row) => (row[3] === "Pending Result" ? "#fff7ed" : undefined)
    }
  );

  doc.end();
});
