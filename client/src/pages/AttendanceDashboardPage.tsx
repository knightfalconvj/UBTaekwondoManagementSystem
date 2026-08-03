import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";

type AttendanceDashboardRow = {
  athleteId: string;
  fullName: string;
  beltRank: string;
  total: number;
  present: number;
  absences: number;
  attendanceRate: number;
  pendingReasons: number;
  validReasons: number;
  invalidReasons: number;
  consecutiveAbsences: number;
  warning: boolean;
};

type DashboardTotals = {
  totalSessions: number;
  totalPresent: number;
  totalAbsences: number;
  warnedAthletes: number;
  pendingReasons: number;
  attendanceRate: number;
};

const defaultTotals: DashboardTotals = {
  totalSessions: 0,
  totalPresent: 0,
  totalAbsences: 0,
  warnedAthletes: 0,
  pendingReasons: 0,
  attendanceRate: 0
};

const EXPORT_SIGNATURE = "knightfalconvj";

export function AttendanceDashboardPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<AttendanceDashboardRow[]>([]);
  const [totals, setTotals] = useState<DashboardTotals>(defaultTotals);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    dateFrom: "",
    dateTo: "",
    eventType: "",
    warningOnly: false
  });

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filters.dateFrom) params.dateFrom = new Date(filters.dateFrom).toISOString();
      if (filters.dateTo) params.dateTo = new Date(filters.dateTo).toISOString();
      if (filters.eventType) params.eventType = filters.eventType;
      if (filters.warningOnly) params.warningOnly = "true";

      const { data } = await api.get("/events/attendance/dashboard", { params });
      setRows(data.rows ?? []);
      setTotals(data.totals ?? defaultTotals);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === "ADMIN") {
      void load();
    }
  }, [user?.role]);

  const chartData = useMemo(() => {
    return [...rows]
      .sort((a, b) => b.absences - a.absences)
      .slice(0, 8)
      .map((row) => ({
        name: row.fullName,
        absences: row.absences,
        present: row.present
      }));
  }, [rows]);

  const hasData = rows.length > 0 && totals.totalSessions > 0;

  const reasonStatusPieData = useMemo(() => {
    return [
      {
        name: "Pending Reasons",
        value: rows.reduce((sum, row) => sum + row.pendingReasons, 0),
        color: "#e0ad1f"
      },
      {
        name: "Valid Reasons",
        value: rows.reduce((sum, row) => sum + row.validReasons, 0),
        color: "#14329f"
      },
      {
        name: "Invalid Reasons",
        value: rows.reduce((sum, row) => sum + row.invalidReasons, 0),
        color: "#ea1b44"
      }
    ];
  }, [rows]);

  const exportCsv = () => {
    const header = [
      "Athlete",
      "Belt Rank",
      "Total Sessions",
      "Present",
      "Absences",
      "Attendance Rate",
      "Consecutive Absences",
      "Pending Reasons",
      "Valid Reasons",
      "Invalid Reasons",
      "Warning"
    ];

    const lines = rows.map((row) => [
      row.fullName,
      row.beltRank || "-",
      String(row.total),
      String(row.present),
      String(row.absences),
      `${row.attendanceRate}%`,
      String(row.consecutiveAbsences),
      String(row.pendingReasons),
      String(row.validReasons),
      String(row.invalidReasons),
      row.warning ? "YES" : "NO"
    ]);

    const signatureRows = [
      [""],
      ["Digital Signature", EXPORT_SIGNATURE],
      ["Generated At", new Date().toISOString()]
    ];

    const csv = [header, ...lines, ...signatureRows]
      .map((line) => line.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `attendance-dashboard-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const printReport = () => {
    const reportWindow = window.open("", "_blank", "width=1100,height=800");
    if (!reportWindow) return;

    const generatedAt = new Date().toLocaleString();
    const filterSummary = [
      `Date From: ${filters.dateFrom || "All"}`,
      `Date To: ${filters.dateTo || "All"}`,
      `Event Type: ${filters.eventType || "All"}`,
      `Warning Only: ${filters.warningOnly ? "Yes" : "No"}`
    ].join(" | ");

    const rowsHtml = rows.map((row) => `
      <tr>
        <td>${row.fullName}</td>
        <td>${row.beltRank || "-"}</td>
        <td>${row.total}</td>
        <td>${row.present}</td>
        <td>${row.absences}</td>
        <td>${row.attendanceRate}%</td>
        <td>${row.consecutiveAbsences}</td>
        <td>P:${row.pendingReasons} V:${row.validReasons} I:${row.invalidReasons}</td>
        <td>${row.warning ? "Warning" : "-"}</td>
      </tr>
    `).join("");

    reportWindow.document.write(`
      <html>
        <head>
          <title>Attendance Dashboard Report</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #1f2a3a; }
            h1, h2 { margin: 0 0 10px; }
            .meta { margin-bottom: 14px; color: #475569; font-size: 13px; }
            .totals { margin: 12px 0 16px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
            .box { border: 1px solid #cfd8e3; border-radius: 8px; padding: 8px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #dbe2ea; padding: 8px; font-size: 12px; text-align: left; }
            th { background: #f2f6fb; }
          </style>
        </head>
        <body>
          <h1>Coach Attendance Dashboard Report</h1>
          <div class="meta">Generated: ${generatedAt}</div>
          <div class="meta">Digital Signature: ${EXPORT_SIGNATURE}</div>
          <div class="meta">Filters: ${filterSummary}</div>
          <div class="totals">
            <div class="box">Total Sessions: ${totals.totalSessions}</div>
            <div class="box">Total Present: ${totals.totalPresent}</div>
            <div class="box">Total Absences: ${totals.totalAbsences}</div>
            <div class="box">Attendance Rate: ${totals.attendanceRate}%</div>
            <div class="box">Warned Athletes: ${totals.warnedAthletes}</div>
            <div class="box">Pending Reason Reviews: ${totals.pendingReasons}</div>
          </div>
          <h2>Athlete Attendance Breakdown</h2>
          <table>
            <thead>
              <tr>
                <th>Athlete</th>
                <th>Belt Rank</th>
                <th>Total</th>
                <th>Present</th>
                <th>Absent</th>
                <th>Rate</th>
                <th>Consecutive Absences</th>
                <th>Reason Reviews</th>
                <th>Warning</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || "<tr><td colspan=\"9\">No records</td></tr>"}
            </tbody>
          </table>
          <!-- hidden-signature: knightfalconvj -->
        </body>
      </html>
    `);

    reportWindow.document.close();
    reportWindow.focus();
    reportWindow.print();
  };

  const exportPdf = async () => {
    const params: Record<string, string> = {};
    if (filters.dateFrom) params.dateFrom = new Date(filters.dateFrom).toISOString();
    if (filters.dateTo) params.dateTo = new Date(filters.dateTo).toISOString();
    if (filters.eventType) params.eventType = filters.eventType;
    if (filters.warningOnly) params.warningOnly = "true";

    const response = await api.get("/reports/attendance-dashboard", {
      params,
      responseType: "blob"
    });

    const blob = new Blob([response.data], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `attendance-dashboard-${new Date().toISOString().slice(0, 10)}.pdf`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (user?.role !== "ADMIN") {
    return (
      <div className="page">
        <section className="panel">
          <h2>Attendance Dashboard</h2>
          <p>Admin access only.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      <section className="panel">
        <h2>Attendance Dashboard</h2>
        <div className="button-row" style={{ marginBottom: 10 }}>
          <button className="btn-outline" type="button" onClick={exportCsv}>Export CSV</button>
          <button className="btn-outline" type="button" onClick={() => void exportPdf()}>Export PDF</button>
          <button className="btn-outline" type="button" onClick={printReport}>Print Report</button>
        </div>
        <form className="form-grid two-col" onSubmit={(event) => { event.preventDefault(); void load(); }}>
          <label>
            Date From
            <input type="date" value={filters.dateFrom} onChange={(event) => setFilters({ ...filters, dateFrom: event.target.value })} />
          </label>
          <label>
            Date To
            <input type="date" value={filters.dateTo} onChange={(event) => setFilters({ ...filters, dateTo: event.target.value })} />
          </label>
          <label>
            Event Type
            <select value={filters.eventType} onChange={(event) => setFilters({ ...filters, eventType: event.target.value })}>
              <option value="">All</option>
              <option value="TRAINING">TRAINING</option>
              <option value="TOURNAMENT">TOURNAMENT</option>
              <option value="TEAM_EVENT">TEAM_EVENT</option>
            </select>
          </label>
          <label>
            Warning Filter
            <select value={filters.warningOnly ? "true" : "false"} onChange={(event) => setFilters({ ...filters, warningOnly: event.target.value === "true" })}>
              <option value="false">All Athletes</option>
              <option value="true">Only Warning (3+ consecutive absences)</option>
            </select>
          </label>
          <button className="btn-primary full" type="submit" disabled={loading}>{loading ? "Loading..." : "Apply Filters"}</button>
        </form>
      </section>

      <section className="panel-grid">
        <article className="panel metric"><h3>Total Sessions</h3><p>{hasData ? totals.totalSessions : "No entry"}</p></article>
        <article className="panel metric"><h3>Total Present</h3><p>{hasData ? totals.totalPresent : "No entry"}</p></article>
        <article className="panel metric"><h3>Total Absences</h3><p>{hasData ? totals.totalAbsences : "No entry"}</p></article>
        <article className="panel metric"><h3>Attendance Rate</h3><p>{hasData ? `${totals.attendanceRate}%` : "No entry"}</p></article>
      </section>

      <section className="panel two-col-flex">
        <div>
          <h2>Warning & Reason Status</h2>
          {hasData ? (
            <>
              <p>Warned Athletes: {totals.warnedAthletes}</p>
              <p>Pending Reason Reviews: {totals.pendingReasons}</p>
            </>
          ) : (
            <p className="muted">No entry.</p>
          )}

          <div className="chart-box" style={{ marginTop: 10 }}>
            <h3>Reason Status Breakdown</h3>
            {hasData ? (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={reasonStatusPieData} dataKey="value" cx="50%" cy="50%" outerRadius={78}>
                    {reasonStatusPieData.map((item) => (
                      <Cell key={item.name} fill={item.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="muted">No entry.</p>
            )}
          </div>
        </div>
        <div className="chart-box">
          <h2>Top Absence Counts</h2>
          {hasData ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} layout="vertical" margin={{ top: 6, right: 8, left: 8, bottom: 6 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={120} />
                <Tooltip />
                <Bar dataKey="absences" fill="#a91e2c" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="muted">No entry.</p>
          )}
        </div>
      </section>

      <section className="panel">
        <h2>Athlete Attendance Breakdown</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Athlete</th>
                <th>Belt Rank</th>
                <th>Total</th>
                <th>Present</th>
                <th>Absent</th>
                <th>Rate</th>
                <th>Consecutive Absences</th>
                <th>Reason Reviews</th>
                <th>Warning</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.athleteId}>
                  <td>{row.fullName}</td>
                  <td>{row.beltRank || "-"}</td>
                  <td>{row.total}</td>
                  <td>{row.present}</td>
                  <td>{row.absences}</td>
                  <td>{row.attendanceRate}%</td>
                  <td>{row.consecutiveAbsences}</td>
                  <td>P:{row.pendingReasons} V:{row.validReasons} I:{row.invalidReasons}</td>
                  <td>{row.warning ? "Warning" : "-"}</td>
                </tr>
              ))}
              {!hasData ? (
                <tr>
                  <td colSpan={9}>No attendance rows for selected filters.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
