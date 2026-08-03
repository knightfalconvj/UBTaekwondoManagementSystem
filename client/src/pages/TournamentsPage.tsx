import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { BarChart, Bar, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Legend, Cell } from "recharts";
import { api } from "../lib/api";
import { ACHIEVEMENT_OPTIONS } from "../types";
import { useAuth } from "../context/AuthContext";

const formInit = { name: "", level: "PROVINCIAL", date: "", venue: "" };

const FALLBACK_COLORS = ["#14329f", "#e0ad1f", "#ea1b44", "#0b2e59", "#c98e0f", "#9f1239", "#1e40af"];

const RESULT_COLORS: Record<string, string> = {
  GOLD: "#e0ad1f",
  SILVER: "#c0c0c0",
  BRONZE: "#cd7f32",
  WIN: "#14329f",
  LOSS: "#ea1b44",
  PENDING: "#6b7280"
};

const toResultKey = (value?: string | null) => {
  if (!value) return "PENDING";
  const normalized = value.trim().toUpperCase();

  if (normalized.includes("GOLD")) return "GOLD";
  if (normalized.includes("SILVER")) return "SILVER";
  if (normalized.includes("BRONZE")) return "BRONZE";
  if (normalized.includes("WIN")) return "WIN";
  if (normalized.includes("LOSS") || normalized.includes("LOSE")) return "LOSS";

  return normalized || "PENDING";
};

const toResultLabel = (key: string) => {
  if (key === "PENDING") return "Pending";
  return key;
};

const buildResultChartData = (rosters: any[]) => {
  const counts = rosters.reduce((acc: Record<string, number>, roster) => {
    const key = toResultKey(roster.result);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const total = rosters.length || 1;

  return Object.entries(counts)
    .map(([result, count]) => ({
      result: toResultLabel(result),
      count,
      percentage: Number(((count / total) * 100).toFixed(1)),
      fill: RESULT_COLORS[result] ?? "#0b2e59"
    }))
    .sort((a, b) => b.count - a.count);
};

const buildBeltRankChartData = (rosters: any[], valueMode: "count" | "percentage") => {
  const grouped = rosters.reduce((acc: Record<string, Record<string, number>>, roster) => {
    const beltRank = roster?.athleteProfile?.beltRank ?? "Unspecified";
    const result = toResultKey(roster.result);

    if (!acc[beltRank]) acc[beltRank] = {};
    acc[beltRank][result] = (acc[beltRank][result] ?? 0) + 1;
    return acc;
  }, {});

  const resultKeys = Array.from(new Set(rosters.map((roster) => toResultKey(roster.result))));

  const data = Object.entries(grouped).map(([beltRank, resultCounts]) => {
    const total = Object.values(resultCounts).reduce((sum, count) => sum + count, 0) || 1;
    const row: Record<string, string | number> = { beltRank };

    resultKeys.forEach((key) => {
      const count = resultCounts[key] ?? 0;
      row[key] = valueMode === "percentage" ? Number(((count / total) * 100).toFixed(1)) : count;
    });

    return row;
  });

  return { data, resultKeys };
};

const resultKeyColor = (key: string, index: number) => {
  return RESULT_COLORS[key] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length];
};

const formatChartValue = (value: unknown, valueMode: "count" | "percentage") => {
  const numeric = typeof value === "number" ? value : Number(value ?? 0);
  return valueMode === "percentage" ? `${numeric}%` : numeric;
};

export function TournamentsPage() {
  const { user } = useAuth();
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [athletes, setAthletes] = useState<any[]>([]);
  const [form, setForm] = useState(formInit);
  const [selectedTournamentId, setSelectedTournamentId] = useState("");
  const [selectedRosterAthlete, setSelectedRosterAthlete] = useState("");
  const [valueMode, setValueMode] = useState<"count" | "percentage">("count");
  const [chartView, setChartView] = useState<"results" | "beltRank">("results");

  const load = async () => {
    const [tRes, aRes] = await Promise.all([
      api.get("/tournaments"),
      user?.role === "ADMIN" ? api.get("/users/athletes") : Promise.resolve({ data: [] })
    ]);
    setTournaments(tRes.data);
    setAthletes(aRes.data);

    setSelectedTournamentId((current) => {
      if (tRes.data.some((tournament: any) => tournament.id === current)) return current;
      return tRes.data[0]?.id || "";
    });
  };

  useEffect(() => {
    void load();
  }, [user?.role]);

  const createTournament = async (event: FormEvent) => {
    event.preventDefault();
    await api.post("/tournaments", { ...form, date: new Date(form.date).toISOString() });
    setForm(formInit);
    await load();
  };

  const addToRoster = async (tournamentId: string) => {
    if (!selectedRosterAthlete) return;
    await api.post(`/tournaments/${tournamentId}/roster`, { athleteProfileId: selectedRosterAthlete });
    await load();
  };

  const removeFromRoster = async (tournamentId: string, rosterId: string) => {
    await api.delete(`/tournaments/${tournamentId}/roster/${rosterId}`);
    await load();
  };

  const editTournament = async (tournament: any) => {
    const name = prompt("Tournament name:", tournament.name) ?? tournament.name;
    const venue = prompt("Venue:", tournament.venue) ?? tournament.venue;
    if (!name || !venue) return;

    await api.patch(`/tournaments/${tournament.id}`, { name, venue });
    await load();
  };

  const deleteTournament = async (tournamentId: string) => {
    await api.delete(`/tournaments/${tournamentId}`);
    await load();
  };

  const saveResult = async (tournamentId: string, rosterId: string) => {
    const result = prompt("Final result:", "Win");
    const coachFeedback = prompt("Coach feedback:", "Strong kicking and balance");
    const achievementType = prompt(`Achievement (${ACHIEVEMENT_OPTIONS.join("/")})`, "GOLD") ?? undefined;
    if (!result || !coachFeedback) return;

    await api.patch(`/tournaments/${tournamentId}/roster/${rosterId}/result`, {
      result,
      coachFeedback,
      achievementType,
      season: "2026"
    });
    await load();
  };

  const selectedTournament = tournaments.find((tournament) => tournament.id === selectedTournamentId) ?? null;

  const selectedTournamentContent = selectedTournament ? (() => {
    const rosters = selectedTournament.rosters ?? [];
    const resultData = buildResultChartData(rosters);
    const beltRankData = buildBeltRankChartData(rosters, valueMode);
    const valueKey = valueMode === "percentage" ? "percentage" : "count";
    const yAxisLabel = valueMode === "percentage" ? "Percentage" : "Athletes";

    return (
      <section className="panel" key={selectedTournament.id}>
        <h3>{selectedTournament.name} ({selectedTournament.level})</h3>
        <p>{new Date(selectedTournament.date).toLocaleDateString()} | {selectedTournament.venue}</p>

        {user?.role === "ADMIN" ? (
          <div className="button-row">
            <button className="btn-outline" onClick={() => editTournament(selectedTournament)}>Edit Tournament</button>
            <button className="btn-danger" onClick={() => deleteTournament(selectedTournament.id)}>Delete Tournament</button>
          </div>
        ) : null}

        {user?.role === "ADMIN" ? (
          <div className="inline-form">
            <select value={selectedRosterAthlete} onChange={(e) => setSelectedRosterAthlete(e.target.value)}>
              <option value="">Select athlete to assign</option>
              {athletes.map((athlete) => (
                <option key={athlete.id} value={athlete.athleteProfile?.id}>{athlete.fullName}</option>
              ))}
            </select>
            <button className="btn-outline" onClick={() => addToRoster(selectedTournament.id)}>Add to Roster</button>
          </div>
        ) : null}

        <div className="table-wrap">
          <table>
            <thead><tr><th>Athlete</th><th>Result</th><th>Feedback</th>{user?.role === "ADMIN" ? <th>Action</th> : null}</tr></thead>
            <tbody>
              {rosters.map((roster: any) => (
                <tr key={roster.id}>
                  <td>{roster.athleteProfile.user.fullName}</td>
                  <td>{roster.result ?? "Pending"}</td>
                  <td>{roster.coachFeedback ?? "-"}</td>
                  {user?.role === "ADMIN" ? (
                    <td>
                      <button className="btn-outline" onClick={() => saveResult(selectedTournament.id, roster.id)}>Update Result</button>
                      <button className="btn-danger" onClick={() => removeFromRoster(selectedTournament.id, roster.id)}>Remove</button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="result-chart">
          <h4>Result Distribution</h4>
          <div className="chart-controls">
            <div className="button-row">
              <button className={chartView === "results" ? "btn-primary" : "btn-outline"} onClick={() => setChartView("results")}>By Result</button>
              <button className={chartView === "beltRank" ? "btn-primary" : "btn-outline"} onClick={() => setChartView("beltRank")}>By Belt Rank</button>
            </div>
            <div className="button-row">
              <button className={valueMode === "count" ? "btn-primary" : "btn-outline"} onClick={() => setValueMode("count")}>Count</button>
              <button className={valueMode === "percentage" ? "btn-primary" : "btn-outline"} onClick={() => setValueMode("percentage")}>Percentage</button>
            </div>
          </div>

          {resultData.length > 0 ? (
            chartView === "results" ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={resultData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="result" interval={0} tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip formatter={(value) => formatChartValue(value, valueMode)} />
                  <Bar dataKey={valueKey} radius={[8, 8, 0, 0]}>
                    {resultData.map((entry) => (
                      <Cell key={`${selectedTournament.id}-${entry.result}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={beltRankData.data} margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="beltRank" interval={0} tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} label={{ value: yAxisLabel, angle: -90, position: "insideLeft" }} />
                  <Tooltip formatter={(value) => formatChartValue(value, valueMode)} />
                  <Legend />
                  {beltRankData.resultKeys.map((key, index) => (
                    <Bar key={key} dataKey={key} stackId="a" fill={resultKeyColor(key, index)} radius={[8, 8, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )
          ) : <p>No roster entries yet.</p>}
        </div>
      </section>
    );
  })() : (
    <section className="panel">
      <p>No tournament selected.</p>
    </section>
  );

  return (
    <div className="page">
      {user?.role === "ADMIN" ? (
        <section className="panel">
          <h2>Create Tournament</h2>
          <form className="form-grid two-col" onSubmit={createTournament}>
            <label>Name<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label>Level<select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}><option>PROVINCIAL</option><option>REGIONAL</option><option>NATIONAL</option><option>INTERNATIONAL</option></select></label>
            <label>Date<input required type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
            <label>Venue<input required value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} /></label>
            <button className="btn-primary full" type="submit">Save Tournament</button>
          </form>
        </section>
      ) : null}

      <section className="panel">
        <h2>Choose Tournament</h2>
        <p>Coach and athlete accounts can view one tournament at a time.</p>
        <div className="inline-form">
          <select value={selectedTournamentId} onChange={(event) => setSelectedTournamentId(event.target.value)}>
            <option value="">Select Tournament</option>
            {tournaments.map((tournament) => (
              <option key={tournament.id} value={tournament.id}>
                {tournament.name} | {new Date(tournament.date).toLocaleDateString()} | {tournament.level}
              </option>
            ))}
          </select>
        </div>
      </section>

      {selectedTournamentContent}
    </div>
  );
}
