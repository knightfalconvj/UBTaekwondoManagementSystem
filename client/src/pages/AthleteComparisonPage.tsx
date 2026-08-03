import { useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";

type AthleteRosterItem = {
  id: string;
  fullName: string;
  isActive: boolean;
  athleteProfile?: { id: string; beltRank: string } | null;
};

type AthleteAnalytics = {
  id: string;
  fullName: string;
  beltRank: string;
  isActive: boolean;
  attendanceRate: number;
  winLoss: { wins: number; losses: number };
  totalPoints: number;
  achievementsByType: Record<string, number>;
  trend: Array<{ period: string; score: number; result: string }>;
};

type ComparisonAthlete = AthleteAnalytics & {
  achievementCount: number;
  trendAverage: number;
  overallScore: number;
  winRate: number;
};

function compareAthletes(athleteA: AthleteAnalytics, athleteB: AthleteAnalytics) {
  const toComparable = (athlete: AthleteAnalytics): ComparisonAthlete => {
    const achievementCount = Object.values(athlete.achievementsByType).reduce((sum, count) => sum + count, 0);
    const trendAverage = athlete.trend.length
      ? Number((athlete.trend.reduce((sum, item) => sum + item.score, 0) / athlete.trend.length).toFixed(2))
      : 0;
    const winRate = athlete.winLoss.wins + athlete.winLoss.losses > 0
      ? Number(((athlete.winLoss.wins / (athlete.winLoss.wins + athlete.winLoss.losses)) * 100).toFixed(2))
      : 0;

    const overallScore = Number((
      (athlete.attendanceRate * 0.35)
      + ((athlete.winLoss.wins - athlete.winLoss.losses) * 7)
      + (athlete.totalPoints * 0.08)
      + (achievementCount * 6)
      + (trendAverage * 15)
    ).toFixed(2));

    return { ...athlete, achievementCount, trendAverage, overallScore, winRate };
  };

  const first = toComparable(athleteA);
  const second = toComparable(athleteB);
  const better = first.overallScore >= second.overallScore ? first : second;
  const weaker = better.id === first.id ? second : first;

  const prosA: string[] = [];
  const consA: string[] = [];
  const prosB: string[] = [];
  const consB: string[] = [];

  if (first.attendanceRate >= second.attendanceRate) {
    prosA.push(`${first.fullName} has stronger attendance at ${first.attendanceRate}% compared to ${second.attendanceRate}%.`);
    consB.push(`${second.fullName} has lower attendance at ${second.attendanceRate}%.`);
  } else {
    prosB.push(`${second.fullName} has stronger attendance at ${second.attendanceRate}% compared to ${first.attendanceRate}%.`);
    consA.push(`${first.fullName} has lower attendance at ${first.attendanceRate}%.`);
  }

  const firstWinRate = first.winLoss.wins + first.winLoss.losses > 0
    ? Number(((first.winLoss.wins / (first.winLoss.wins + first.winLoss.losses)) * 100).toFixed(2))
    : 0;
  const secondWinRate = second.winLoss.wins + second.winLoss.losses > 0
    ? Number(((second.winLoss.wins / (second.winLoss.wins + second.winLoss.losses)) * 100).toFixed(2))
    : 0;

  if (firstWinRate >= secondWinRate) {
    prosA.push(`${first.fullName} has the better win ratio at ${firstWinRate}%.`);
    consB.push(`${second.fullName} has a weaker win ratio at ${secondWinRate}%.`);
  } else {
    prosB.push(`${second.fullName} has the better win ratio at ${secondWinRate}%.`);
    consA.push(`${first.fullName} has a weaker win ratio at ${firstWinRate}%.`);
  }

  if (first.totalPoints >= second.totalPoints) {
    prosA.push(`${first.fullName} has more ranking points with ${first.totalPoints} total points.`);
    consB.push(`${second.fullName} trails in points with ${second.totalPoints}.`);
  } else {
    prosB.push(`${second.fullName} has more ranking points with ${second.totalPoints} total points.`);
    consA.push(`${first.fullName} trails in points with ${first.totalPoints}.`);
  }

  if (first.achievementCount >= second.achievementCount) {
    prosA.push(`${first.fullName} shows a stronger medal record with ${first.achievementCount} achievements.`);
    consB.push(`${second.fullName} has fewer recorded achievements at ${second.achievementCount}.`);
  } else {
    prosB.push(`${second.fullName} shows a stronger medal record with ${second.achievementCount} achievements.`);
    consA.push(`${first.fullName} has fewer recorded achievements at ${first.achievementCount}.`);
  }

  const detailedSummary = [
    `Attendance: ${first.fullName} ${first.attendanceRate}% vs ${second.fullName} ${second.attendanceRate}%`,
    `Win/Loss: ${first.fullName} ${first.winLoss.wins}-${first.winLoss.losses} (${first.winRate}%) vs ${second.fullName} ${second.winLoss.wins}-${second.winLoss.losses} (${second.winRate}%)`,
    `Points: ${first.fullName} ${first.totalPoints} vs ${second.fullName} ${second.totalPoints}`,
    `Achievements: ${first.fullName} ${first.achievementCount} vs ${second.fullName} ${second.achievementCount}`,
    `Trend average: ${first.fullName} ${first.trendAverage} vs ${second.fullName} ${second.trendAverage}`
  ];

  return {
    first,
    second,
    summary: `${first.fullName} scored ${first.overallScore.toFixed(2)} while ${second.fullName} scored ${second.overallScore.toFixed(2)}. ${better.fullName} is currently ahead based on the combined weight of attendance, results, points, achievements, and trend consistency.`,
    detailedSummary,
    decisionReason: `${better.fullName} is the better overall athlete right now because the weighted score favors consistency, match results, and accumulated output. ${weaker.fullName} still has value in the areas listed above, but needs to improve the weaker categories to close the gap.`,
    prosA,
    consA,
    prosB,
    consB,
    winner: better.fullName,
    loser: weaker.fullName
  };
}

export function AthleteComparisonPage() {
  const { user } = useAuth();
  const [athleteAnalytics, setAthleteAnalytics] = useState<AthleteAnalytics[]>([]);
  const [primaryAthleteId, setPrimaryAthleteId] = useState("");
  const [comparisonAthleteId, setComparisonAthleteId] = useState("");

  useEffect(() => {
    const load = async () => {
      if (user?.role !== "ADMIN") return;

      const athletes = await api.get<AthleteRosterItem[]>("/users/athletes");
      const summaries = await Promise.all(
        athletes.data.map(async (athlete) => {
          const athleteProfileId = athlete.athleteProfile?.id;
          if (!athleteProfileId) return null;

          const analytics = await api.get(`/analytics/individual/${athleteProfileId}`);
          return {
            id: athlete.id,
            fullName: athlete.fullName,
            isActive: athlete.isActive,
            beltRank: athlete.athleteProfile?.beltRank ?? "",
            attendanceRate: analytics.data.attendanceRate,
            winLoss: analytics.data.winLoss,
            totalPoints: analytics.data.totalPoints,
            achievementsByType: analytics.data.achievementsByType,
            trend: analytics.data.trend
          };
        })
      );

      const filtered = summaries.filter((item): item is AthleteAnalytics => item !== null);
      setAthleteAnalytics(filtered);
      if (filtered.length > 0) {
        setPrimaryAthleteId(filtered[0].id);
        setComparisonAthleteId(filtered.find((athlete) => athlete.id !== filtered[0].id)?.id ?? "");
      }
    };

    void load();
  }, [user?.role]);

  const primaryAthlete = useMemo(() => athleteAnalytics.find((athlete) => athlete.id === primaryAthleteId) ?? null, [athleteAnalytics, primaryAthleteId]);
  const comparisonAthlete = useMemo(() => athleteAnalytics.find((athlete) => athlete.id === comparisonAthleteId) ?? null, [athleteAnalytics, comparisonAthleteId]);
  const comparisonReport = primaryAthlete && comparisonAthlete && primaryAthlete.id !== comparisonAthlete.id
    ? compareAthletes(primaryAthlete, comparisonAthlete)
    : null;

  const metricRows = comparisonReport
    ? [
        { label: "Attendance", first: `${comparisonReport.first.attendanceRate}%`, second: `${comparisonReport.second.attendanceRate}%` },
        { label: "Win Rate", first: `${comparisonReport.first.winRate}%`, second: `${comparisonReport.second.winRate}%` },
        { label: "Record", first: `${comparisonReport.first.winLoss.wins}-${comparisonReport.first.winLoss.losses}`, second: `${comparisonReport.second.winLoss.wins}-${comparisonReport.second.winLoss.losses}` },
        { label: "Points", first: `${comparisonReport.first.totalPoints}`, second: `${comparisonReport.second.totalPoints}` },
        { label: "Achievements", first: `${comparisonReport.first.achievementCount}`, second: `${comparisonReport.second.achievementCount}` },
        { label: "Trend Avg.", first: `${comparisonReport.first.trendAverage}`, second: `${comparisonReport.second.trendAverage}` }
      ]
    : [];

  const selectedPrimaryLabel = primaryAthlete ? `${primaryAthlete.fullName}${primaryAthlete.beltRank ? ` (${primaryAthlete.beltRank})` : ""}` : "Select first athlete";
  const selectedComparisonLabel = comparisonAthlete ? `${comparisonAthlete.fullName}${comparisonAthlete.beltRank ? ` (${comparisonAthlete.beltRank})` : ""}` : "Select second athlete";

  function downloadPDF() {
    if (!comparisonReport) return;

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const marginX = 48;
    const contentW = pageW - marginX * 2;
    let y = 48;

    const LINE_HEIGHT = 16;
    const SECTION_GAP = 24;

    const addText = (text: string, size: number, bold = false, color: [number, number, number] = [30, 30, 30]) => {
      doc.setFontSize(size);
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setTextColor(...color);
      const lines = doc.splitTextToSize(text, contentW) as string[];
      lines.forEach((line) => {
        if (y > doc.internal.pageSize.getHeight() - 48) {
          doc.addPage();
          y = 48;
        }
        doc.text(line, marginX, y);
        y += size * 1.35;
      });
    };

    const addDivider = () => {
      doc.setDrawColor(200, 200, 200);
      doc.line(marginX, y, pageW - marginX, y);
      y += 12;
    };

    // Title
    addText("Athlete Comparison Report", 22, true, [10, 10, 80]);
    addText(`Generated: ${new Date().toLocaleDateString()}`, 9, false, [120, 120, 120]);
    y += SECTION_GAP;
    addDivider();

    // Overall decision
    addText("Overall Decision", 13, true, [10, 10, 80]);
    y += 4;
    addText(`Winner: ${comparisonReport.winner}`, 11, false);
    addText(comparisonReport.summary, 10, false);
    addText(comparisonReport.decisionReason, 10, false);
    y += SECTION_GAP;
    addDivider();

    // Scores
    addText("Overall Scores", 13, true, [10, 10, 80]);
    y += 4;
    addText(`${comparisonReport.first.fullName} (${comparisonReport.first.beltRank || "Unranked"}): ${comparisonReport.first.overallScore.toFixed(2)}`, 11, false);
    addText(`${comparisonReport.second.fullName} (${comparisonReport.second.beltRank || "Unranked"}): ${comparisonReport.second.overallScore.toFixed(2)}`, 11, false);
    y += SECTION_GAP;
    addDivider();

    // Metrics table
    addText("Side-by-Side Metrics", 13, true, [10, 10, 80]);
    y += 8;
    const colW = contentW / 3;
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(80, 80, 80);
    doc.text("Metric", marginX, y);
    doc.text(comparisonReport.first.fullName, marginX + colW, y);
    doc.text(comparisonReport.second.fullName, marginX + colW * 2, y);
    y += LINE_HEIGHT;
    addDivider();
    metricRows.forEach((row) => {
      if (y > doc.internal.pageSize.getHeight() - 48) { doc.addPage(); y = 48; }
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(30, 30, 30);
      doc.text(row.label, marginX, y);
      doc.text(row.first, marginX + colW, y);
      doc.text(row.second, marginX + colW * 2, y);
      y += LINE_HEIGHT + 4;
    });
    y += SECTION_GAP;
    addDivider();

    // Pros & Cons A
    addText(`${comparisonReport.first.fullName} — Strengths`, 13, true, [10, 10, 80]);
    y += 4;
    comparisonReport.prosA.forEach((item) => addText(`+ ${item}`, 10));
    if (comparisonReport.prosA.length === 0) addText("No major advantage found.", 10);
    y += 8;
    addText(`${comparisonReport.first.fullName} — Weaknesses`, 13, true, [10, 10, 80]);
    y += 4;
    comparisonReport.consA.forEach((item) => addText(`- ${item}`, 10));
    if (comparisonReport.consA.length === 0) addText("No major weakness found.", 10);
    y += SECTION_GAP;
    addDivider();

    // Pros & Cons B
    addText(`${comparisonReport.second.fullName} — Strengths`, 13, true, [10, 10, 80]);
    y += 4;
    comparisonReport.prosB.forEach((item) => addText(`+ ${item}`, 10));
    if (comparisonReport.prosB.length === 0) addText("No major advantage found.", 10);
    y += 8;
    addText(`${comparisonReport.second.fullName} — Weaknesses`, 13, true, [10, 10, 80]);
    y += 4;
    comparisonReport.consB.forEach((item) => addText(`- ${item}`, 10));
    if (comparisonReport.consB.length === 0) addText("No major weakness found.", 10);

    const filename = `comparison_${comparisonReport.first.fullName.replace(/\s+/g, "_")}_vs_${comparisonReport.second.fullName.replace(/\s+/g, "_")}.pdf`;
    doc.save(filename);
  }

  if (user?.role !== "ADMIN") {
    return (
      <div className="page">
        <section className="panel">
          <p>Coach access only.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      <section className="panel comparison-hero">
        <div className="comparison-hero-copy">
          <p className="comparison-eyebrow">Coach Tools</p>
          <h2>Athlete Comparison</h2>
          <p>
            Choose two athletes and get a side-by-side evaluation that is easy to read, visually balanced, and built for quick coaching decisions.
          </p>
        </div>

        <div className="comparison-selector-grid">
          <label className="comparison-selector-card">
            <span>First Athlete</span>
            <select value={primaryAthleteId} onChange={(event) => setPrimaryAthleteId(event.target.value)}>
              <option value="">Select first athlete</option>
              {athleteAnalytics.map((athlete) => (
                <option key={athlete.id} value={athlete.id}>
                  {athlete.fullName} {athlete.beltRank ? `(${athlete.beltRank})` : ""}
                </option>
              ))}
            </select>
            <small>{selectedPrimaryLabel}</small>
          </label>

          <label className="comparison-selector-card accent">
            <span>Second Athlete</span>
            <select value={comparisonAthleteId} onChange={(event) => setComparisonAthleteId(event.target.value)}>
              <option value="">Select second athlete</option>
              {athleteAnalytics
                .filter((athlete) => athlete.id !== primaryAthleteId)
                .map((athlete) => (
                  <option key={athlete.id} value={athlete.id}>
                    {athlete.fullName} {athlete.beltRank ? `(${athlete.beltRank})` : ""}
                  </option>
                ))}
            </select>
            <small>{selectedComparisonLabel}</small>
          </label>
        </div>
      </section>

      {comparisonReport ? (
        <article className="comparison-report">
          <header className="comparison-report-header">
            <div>
              <p className="comparison-eyebrow">Detailed Coaching View</p>
              <h3>Two-Athlete Comparison</h3>
              <p>
                Comparing <strong>{comparisonReport.first.fullName}</strong> and <strong>{comparisonReport.second.fullName}</strong>.
                The report balances attendance, performance, achievements, and consistency to make the decision easy to understand.
              </p>
            </div>

            <div className="comparison-winner-card">
              <span>Overall Decision</span>
              <strong>{comparisonReport.winner}</strong>
              <small>Weighted scoring favors this athlete based on the selected metrics.</small>
            </div>

            <button className="btn-download-pdf" onClick={downloadPDF} type="button">
              Download PDF
            </button>
          </header>

          <div className="comparison-score-grid">
            <article className="comparison-athlete-card navy">
              <div className="comparison-athlete-label">Athlete A</div>
              <h4>{comparisonReport.first.fullName}</h4>
              <p>{comparisonReport.first.beltRank || "Unspecified belt rank"}</p>
              <div className="comparison-score">{comparisonReport.first.overallScore.toFixed(2)}</div>
            </article>

            <div className="comparison-vs">VS</div>

            <article className="comparison-athlete-card gold">
              <div className="comparison-athlete-label">Athlete B</div>
              <h4>{comparisonReport.second.fullName}</h4>
              <p>{comparisonReport.second.beltRank || "Unspecified belt rank"}</p>
              <div className="comparison-score">{comparisonReport.second.overallScore.toFixed(2)}</div>
            </article>
          </div>

          <section className="comparison-section">
            <div className="section-heading">
              <div>
                <p className="comparison-eyebrow">Metric Breakdown</p>
                <h4>Side-by-Side Snapshot</h4>
              </div>
              <p>Each row shows the key metric that influences the final decision.</p>
            </div>

            <div className="comparison-metric-table">
              {metricRows.map((row) => (
                <div key={row.label} className="comparison-metric-row">
                  <span className="metric-label">{row.label}</span>
                  <span className="metric-value first">{row.first}</span>
                  <span className="metric-value second">{row.second}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="comparison-section">
            <div className="section-heading">
              <div>
                <p className="comparison-eyebrow">Detailed Summary</p>
                <h4>What the Comparison Means</h4>
              </div>
            </div>
            <div className="comparison-summary-grid">
              {comparisonReport.detailedSummary.map((item) => (
                <article key={item} className="summary-pill">
                  <span>{item}</span>
                </article>
              ))}
            </div>
          </section>

          <section className="comparison-dual-grid">
            <article className="comparison-analysis-card">
              <div className="section-heading compact">
                <div>
                  <p className="comparison-eyebrow">{comparisonReport.first.fullName}</p>
                  <h4>Pros</h4>
                </div>
              </div>
              <ul className="comparison-list positive">
                {comparisonReport.prosA.length > 0 ? comparisonReport.prosA.map((item) => <li key={item}>{item}</li>) : <li>No major advantage found.</li>}
              </ul>

              <div className="section-heading compact">
                <div>
                  <h4>Cons</h4>
                </div>
              </div>
              <ul className="comparison-list negative">
                {comparisonReport.consA.length > 0 ? comparisonReport.consA.map((item) => <li key={item}>{item}</li>) : <li>No major weakness found.</li>}
              </ul>
            </article>

            <article className="comparison-analysis-card accent">
              <div className="section-heading compact">
                <div>
                  <p className="comparison-eyebrow">{comparisonReport.second.fullName}</p>
                  <h4>Pros</h4>
                </div>
              </div>
              <ul className="comparison-list positive">
                {comparisonReport.prosB.length > 0 ? comparisonReport.prosB.map((item) => <li key={item}>{item}</li>) : <li>No major advantage found.</li>}
              </ul>

              <div className="section-heading compact">
                <div>
                  <h4>Cons</h4>
                </div>
              </div>
              <ul className="comparison-list negative">
                {comparisonReport.consB.length > 0 ? comparisonReport.consB.map((item) => <li key={item}>{item}</li>) : <li>No major weakness found.</li>}
              </ul>
            </article>
          </section>

          <section className="comparison-decision-banner">
            <div>
              <p className="comparison-eyebrow">Coach Decision</p>
              <h4>Overall Decision</h4>
              <p><strong>Better overall athlete:</strong> {comparisonReport.winner}</p>
            </div>
            <div>
              <p>{comparisonReport.summary}</p>
              <p>{comparisonReport.decisionReason}</p>
            </div>
          </section>
        </article>
      ) : primaryAthlete && comparisonAthlete && primaryAthlete.id === comparisonAthlete.id ? (
        <section className="warning-banner">
          Choose two different athletes to generate a comparison.
        </section>
      ) : (
        <section className="panel">
          <p>Select two athletes to see a full comparison report.</p>
        </section>
      )}
    </div>
  );
}