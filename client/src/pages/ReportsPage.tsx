import { useEffect, useState } from "react";
import { API_BASE, api } from "../lib/api";
import { useAuth } from "../context/AuthContext";

type TournamentOption = {
  id: string;
  name: string;
  level: string;
  date: string;
  venue: string;
};

function fetchReport(path: string) {
  const token = localStorage.getItem("ubtms_token");
  if (!token) return Promise.resolve(null);
  return fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
    .then((res) => res.blob());
}

function viewReport(path: string) {
  void fetchReport(path).then((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
  });
}

function downloadReport(path: string, filename: string) {
  void fetchReport(path).then((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  });
}

export function ReportsPage() {
  const { user } = useAuth();
  const [tournaments, setTournaments] = useState<TournamentOption[]>([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState("");
  const [selectedReportKey, setSelectedReportKey] = useState("");

  const reportOptions = [
    user?.athleteProfile?.id
      ? {
          key: "athlete-profile",
          label: "Athlete Full Profile",
          path: `/reports/athlete/${user.athleteProfile.id}`,
          filename: "athlete-full-profile.pdf"
        }
      : null,
    {
      key: "attendance-summary",
      label: "Attendance Summary",
      path: "/reports/attendance",
      filename: "attendance-summary.pdf"
    },
    {
      key: "performance-summary",
      label: "Performance Summary",
      path: "/reports/performance",
      filename: "performance-summary.pdf"
    },
    {
      key: "achievement-records",
      label: "Achievement Records",
      path: "/reports/achievements",
      filename: "achievement-records.pdf"
    },
    user?.role === "ADMIN"
      ? {
          key: "team-rankings",
          label: "Team Rankings",
          path: "/reports/rankings",
          filename: "team-rankings.pdf"
        }
      : null
  ].filter(Boolean) as Array<{ key: string; label: string; path: string; filename: string }>;

  const selectedReport = reportOptions.find((report) => report.key === selectedReportKey) ?? reportOptions[0] ?? null;

  useEffect(() => {
    if (!reportOptions.length) {
      setSelectedReportKey("");
      return;
    }

    setSelectedReportKey((current) => {
      if (reportOptions.some((report) => report.key === current)) return current;
      return reportOptions[0].key;
    });
  }, [reportOptions]);

  useEffect(() => {
    if (user?.role !== "ADMIN") return;

    const loadTournaments = async () => {
      const { data } = await api.get<TournamentOption[]>("/tournaments");
      setTournaments(data);
      setSelectedTournamentId((current) => current || data[0]?.id || "");
    };

    void loadTournaments();
  }, [user?.role]);

  return (
    <div className="page">
      <section className="panel">
        <h2>PDF Export Center</h2>
        <p>Generate downloadable branded reports.</p>
        <div className="inline-form">
          <select value={selectedReport?.key ?? ""} onChange={(event) => setSelectedReportKey(event.target.value)}>
            {reportOptions.map((report) => (
              <option key={report.key} value={report.key}>
                {report.label}
              </option>
            ))}
          </select>
          <button
            className="btn-primary"
            type="button"
            disabled={!selectedReport}
            onClick={() => selectedReport && viewReport(selectedReport.path)}
          >
            View PDF
          </button>
          <button
            className="btn-outline"
            type="button"
            disabled={!selectedReport}
            onClick={() => selectedReport && downloadReport(selectedReport.path, selectedReport.filename)}
          >
            Download PDF
          </button>
        </div>
      </section>

      {user?.role === "ADMIN" ? (
        <section className="panel">
          <h2>Tournament Report Export</h2>
          <p>Select a tournament to export a PDF with roster details, statistics, analytics, and colorful graphs.</p>
          <div className="inline-form">
            <select value={selectedTournamentId} onChange={(event) => setSelectedTournamentId(event.target.value)}>
              <option value="">Select Tournament</option>
              {tournaments.map((tournament) => (
                <option key={tournament.id} value={tournament.id}>
                  {tournament.name} | {new Date(tournament.date).toLocaleDateString()} | {tournament.level}
                </option>
              ))}
            </select>
            <button
              className="btn-primary"
              type="button"
              disabled={!selectedTournamentId}
              onClick={() => viewReport(`/reports/tournament/${selectedTournamentId}`)}
            >
              View Tournament PDF
            </button>
            <button
              className="btn-outline"
              type="button"
              disabled={!selectedTournamentId}
              onClick={() => downloadReport(`/reports/tournament/${selectedTournamentId}`, "tournament-report.pdf")}
            >
              Download Tournament PDF
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
