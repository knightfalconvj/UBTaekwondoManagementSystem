import { useEffect, useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  BarChart,
  Bar,
  Legend
} from "recharts";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";

type UpcomingEvent = { id: string; title: string; type: string; date: string; venue: string; status: string };
type NotificationItem = { id: string; title: string; message: string; isRead: boolean; createdAt: string };
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
  hasData: boolean;
  attendanceRate: number;
  winLoss: { wins: number; losses: number };
  totalPoints: number;
  achievementsByType: Record<string, number>;
  trend: Array<{ period: string; score: number; result: string }>;
};

type TeamAnalyticsSummary = {
  hasData: boolean;
  teamAttendancePercentage: number;
  competitionParticipationRate: number;
  tournamentWinRate: number;
  medals: {
    GOLD: number;
    SILVER: number;
    BRONZE: number;
  };
};

type IndividualAnalyticsSummary = {
  hasData: boolean;
  attendanceRate: number;
  winLoss: { wins: number; losses: number };
  totalPoints: number;
  achievementsByType: Record<string, number>;
  trend: Array<{ period: string; score: number; result: string }>;
};

type DashboardFilters = {
  year: string;
};

export function DashboardPage() {
  const { user } = useAuth();
  const [upcoming, setUpcoming] = useState<UpcomingEvent[]>([]);
  const [tournaments, setTournaments] = useState<Array<{ id: string; name: string; date: string }>>([]);
  const [attendance, setAttendance] = useState<any>({
    total: 0,
    present: 0,
    absences: 0,
    percentage: 0,
    consecutiveAbsences: 0,
    warning: false,
    byEventType: {}
  });
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [teamStats, setTeamStats] = useState<TeamAnalyticsSummary | null>(null);
  const [individual, setIndividual] = useState<IndividualAnalyticsSummary | null>(null);
  const [athleteAnalytics, setAthleteAnalytics] = useState<AthleteAnalytics[]>([]);
  const [selectedAthleteId, setSelectedAthleteId] = useState("");
  const [selectedAthleteAnalytics, setSelectedAthleteAnalytics] = useState<AthleteAnalytics | null>(null);
  const [filters, setFilters] = useState<DashboardFilters>({
    year: "all"
  });

  const yearOptions = Array.from({ length: 31 }, (_unused, index) => String(2020 + index));

  const buildParams = () => {
    const params: Record<string, string> = {};
    if (filters.year !== "all") params.year = filters.year;
    return params;
  };

  useEffect(() => {
    const run = async () => {
      const params = buildParams();
      const yearParams = filters.year !== "all" ? { year: filters.year } : {};

      const [eventsRes, attendanceRes, teamRes, tournamentsRes] = await Promise.all([
        api.get<UpcomingEvent[]>("/dashboard/upcoming-events", { params }),
        api.get("/events/attendance/summary", { params }),
        api.get<TeamAnalyticsSummary>("/analytics/team", { params: yearParams }),
        api.get<Array<{ id: string; name: string; date: string }>>("/tournaments", { params: yearParams })
      ]);
      setUpcoming(eventsRes.data);
      setAttendance(attendanceRes.data);
      setTeamStats(teamRes.data);
      setTournaments(tournamentsRes.data);

      if (user?.role === "ADMIN") {
        const athletes = await api.get<AthleteRosterItem[]>('/users/athletes');
        const summaries = await Promise.all(
          athletes.data.map(async (athlete) => {
            const athleteProfileId = athlete.athleteProfile?.id;
            if (!athleteProfileId) {
              return null;
            }

            const analytics = await api.get<IndividualAnalyticsSummary>(`/analytics/individual/${athleteProfileId}`, { params: yearParams });
            return {
              id: athlete.id,
              fullName: athlete.fullName,
              isActive: athlete.isActive,
              beltRank: athlete.athleteProfile?.beltRank ?? "",
              hasData: analytics.data.hasData,
              attendanceRate: analytics.data.attendanceRate,
              winLoss: analytics.data.winLoss,
              totalPoints: analytics.data.totalPoints,
              achievementsByType: analytics.data.achievementsByType,
              trend: analytics.data.trend
            };
          })
        );
        const filteredSummaries = summaries.filter((item): item is AthleteAnalytics => item !== null && item.hasData);
        setAthleteAnalytics(filteredSummaries);

        const preservedSelection = filteredSummaries.find((item) => item.id === selectedAthleteId) ?? filteredSummaries[0] ?? null;
        if (preservedSelection) {
          setSelectedAthleteId(preservedSelection.id);
          setSelectedAthleteAnalytics(preservedSelection);
        } else {
          setSelectedAthleteId("");
          setSelectedAthleteAnalytics(null);
        }
      } else if (user?.athleteProfile?.id) {
        const stats = await api.get<IndividualAnalyticsSummary>(`/analytics/individual/${user.athleteProfile.id}`, { params: yearParams });
        setIndividual(stats.data);
      } else {
        setIndividual(null);
      }
    };

    void run();
  }, [filters.year, user?.role, user?.athleteProfile?.id]);

  useEffect(() => {
    const run = async () => {
      const notificationsRes = await api.get("/me/notifications");
      setNotifications(notificationsRes.data);
    };

    void run();
  }, []);

  const pieData = [
    { name: "Present", value: attendance.present },
    { name: "Absent", value: attendance.absences }
  ];

  const eventTypeStats = Object.entries(attendance.byEventType ?? {}) as Array<[string, any]>;
  const hasEventEntries = upcoming.length > 0;
  const hasAttendanceEntries = Number(attendance.total ?? 0) > 0;
  const hasTeamStatsEntries = Boolean(teamStats?.hasData);
  const hasIndividualEntries = Boolean(individual?.hasData);

  const teamKpiData = teamStats
    ? [
        { name: "Attendance", value: teamStats.teamAttendancePercentage, color: "#14329f" },
        { name: "Participation", value: teamStats.competitionParticipationRate, color: "#e0ad1f" },
        { name: "Win Rate", value: teamStats.tournamentWinRate, color: "#ea1b44" }
      ]
    : [];

  const trainingCount = upcoming.filter((event) => event.type === "TRAINING").length;
  const tournamentEventCount = upcoming.filter((event) => event.type === "TOURNAMENT").length;
  const teamEventCount = upcoming.filter((event) => event.type === "TEAM_EVENT").length;

  const medalData = teamStats
    ? [
        { name: "Gold", value: teamStats.medals.GOLD, color: "#e0ad1f" },
        { name: "Silver", value: teamStats.medals.SILVER, color: "#c0c0c0" },
        { name: "Bronze", value: teamStats.medals.BRONZE, color: "#cd7f32" }
      ]
    : [];

  const athleteAchievementData = individual?.achievementsByType
    ? Object.entries(individual.achievementsByType).map(([name, value], index) => ({
        name,
        value,
        color: ["#e0ad1f", "#14329f", "#ea1b44", "#0b2e59"][index % 4]
      }))
    : [];

  const pendingAthleteCount = user?.role === "ADMIN"
    ? athleteAnalytics.filter((athlete) => !athlete.isActive).length
    : 0;

  const achievementColor = (type: string) => {
    const normalized = type.toUpperCase();
    if (normalized === "GOLD") return "#e0ad1f";
    if (normalized === "SILVER") return "#c0c0c0";
    if (normalized === "BRONZE") return "#cd7f32";
    return "#14329f";
  };

  const eventsSectionTitle = filters.year !== "all"
    ? `Events in ${filters.year}`
    : "Upcoming Events";

  const markNotificationRead = async (id: string) => {
    await api.patch(`/me/notifications/${id}/read`);
    setNotifications((prev) => prev.map((item) => item.id === id ? { ...item, isRead: true } : item));
  };

  const selectAthlete = async (athleteId: string) => {
    setSelectedAthleteId(athleteId);
    const athlete = athleteAnalytics.find((item) => item.id === athleteId) ?? null;
    if (athlete) {
      setSelectedAthleteAnalytics(athlete);
    }
  };

  return (
    <div className="page">
      <section className="panel">
        <div className="section-heading compact">
          <div>
            <p className="comparison-eyebrow">Dashboard Filters</p>
            <h4>Choose what to show</h4>
          </div>
        </div>
        <div className="form-grid two-col" style={{ marginTop: 12 }}>
          <label>
            Year
            <select value={filters.year} onChange={(event) => setFilters((current) => ({ ...current, year: event.target.value }))}>
              <option value="all">All years</option>
              {yearOptions.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="panel-grid">
        <article className="panel metric"><h3>Total Sessions</h3><p>{attendance.total}</p></article>
        <article className="panel metric"><h3>Present Days</h3><p>{attendance.present}</p></article>
        <article className="panel metric"><h3>Absences</h3><p>{attendance.absences}</p></article>
        <article className="panel metric"><h3>Attendance Rate</h3><p>{attendance.percentage}%</p></article>
      </section>

      <section className="panel-grid">
        <article className="panel metric"><h3>Trainings</h3><p>{trainingCount}</p></article>
        <article className="panel metric"><h3>Tournaments</h3><p>{tournaments.length || tournamentEventCount}</p></article>
        <article className="panel metric"><h3>Team Events</h3><p>{teamEventCount}</p></article>
        <article className="panel metric"><h3>Events in Year</h3><p>{upcoming.length}</p></article>
      </section>

      <section className="panel two-col-flex">
        <div>
          <h2>{eventsSectionTitle}</h2>
          <p className="muted">
            {filters.year !== "all"
              ? `Showing all saved events for ${filters.year}.`
              : "Showing upcoming events from the database."}
          </p>
          {user?.role === "ATHLETE" && attendance.warning ? (
            <p className="warning-banner">Warning: You currently have {attendance.consecutiveAbsences} consecutive absences.</p>
          ) : null}
          <ul className="event-list">
            {upcoming.map((event) => (
              <li key={event.id}>
                <strong>{event.title}</strong>
                <span>{new Date(event.date).toLocaleDateString()} | {event.venue}</span>
              </li>
            ))}
            {!hasEventEntries ? <li><span>No entry.</span></li> : null}
          </ul>
        </div>
        <div className="chart-box">
          <h2>Attendance Breakdown {filters.year !== "all" ? `(${filters.year})` : ""}</h2>
          {hasAttendanceEntries ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={pieData} dataKey="value" cx="50%" cy="50%" outerRadius={85}>
                  <Cell fill="#0b2e59" />
                  <Cell fill="#e0ad1f" />
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="muted">No entry.</p>
          )}
        </div>
      </section>

      {user?.role === "ATHLETE" ? (
        <section className="panel two-col-flex">
          <div>
            <h2>Attendance Statistics {filters.year !== "all" ? `(${filters.year})` : ""}</h2>
            <p>Consecutive Absences: {attendance.consecutiveAbsences}</p>
            <p>Absence Rate: {attendance.total ? Number(((attendance.absences / attendance.total) * 100).toFixed(2)) : 0}%</p>
            <h3>By Event Type</h3>
            <ul className="event-list">
              {eventTypeStats.map(([type, stats]) => (
                <li key={type}>
                  <strong>{type}</strong>
                  <span>Total: {stats.total} | Present: {stats.present} | Absent: {stats.absences}</span>
                </li>
              ))}
              {!hasAttendanceEntries ? <li><span>No entry.</span></li> : null}
            </ul>
          </div>
          <div>
            <h2>My Notifications</h2>
            <ul className="event-list">
              {notifications.map((item) => (
                <li key={item.id}>
                  <strong>{item.title}</strong>
                  <span>{item.message}</span>
                  <span>{new Date(item.createdAt).toLocaleString()}</span>
                  {!item.isRead ? (
                    <button className="btn-outline" onClick={() => markNotificationRead(item.id)}>Mark as Read</button>
                  ) : (
                    <span>Read</span>
                  )}
                </li>
              ))}
              {notifications.length === 0 ? <li><span>No notifications yet.</span></li> : null}
            </ul>
          </div>
        </section>
      ) : null}

      {teamStats ? (
        <section className="panel two-col-flex">
          <div className="chart-box">
            <h2>Team-Wide Statistics {filters.year !== "all" ? `(${filters.year})` : ""}</h2>
            {hasTeamStatsEntries ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={teamKpiData} margin={{ top: 8, right: 16, left: 0, bottom: 6 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis domain={[0, 100]} />
                  <Tooltip formatter={(value) => [`${value}%`, "Value"]} />
                  <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                    {teamKpiData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="muted">No entry.</p>
            )}
          </div>

          <div className="chart-box">
            <h2>Medal Distribution {filters.year !== "all" ? `(${filters.year})` : ""}</h2>
            {hasTeamStatsEntries ? (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={medalData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={82}>
                    {medalData.map((item) => (
                      <Cell key={item.name} fill={item.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [value, "Count"]} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="muted">No entry.</p>
            )}
          </div>

          <div className="full">
            {hasTeamStatsEntries ? (
              <>
                <p>Overall Attendance: {teamStats.teamAttendancePercentage}%</p>
                <p>Medals: Gold {teamStats.medals.GOLD}, Silver {teamStats.medals.SILVER}, Bronze {teamStats.medals.BRONZE}</p>
                <p>Participation Rate: {teamStats.competitionParticipationRate}%</p>
                <p>Tournament Win Rate: {teamStats.tournamentWinRate}%</p>
              </>
            ) : (
              <p className="muted">No entry.</p>
            )}
          </div>
        </section>
      ) : null}

      {user?.role === "ADMIN" && pendingAthleteCount > 0 ? (
        <section className="warning-banner">
          {pendingAthleteCount} athlete registration{pendingAthleteCount > 1 ? "s are" : " is"} waiting for coach verification and approval.
        </section>
      ) : null}

      {user?.role === "ADMIN" && athleteAnalytics.length > 0 ? (
        <section className="panel page">
          <div>
            <h2>Athlete Statistics and Analytics {filters.year !== "all" ? `(${filters.year})` : ""}</h2>
            <p>Select one athlete to view their personal statistics and charts.</p>
          </div>

          <div className="inline-form">
            <select value={selectedAthleteId} onChange={(event) => void selectAthlete(event.target.value)}>
              {athleteAnalytics.map((athlete) => (
                <option key={athlete.id} value={athlete.id}>
                  {athlete.fullName} {athlete.beltRank ? `(${athlete.beltRank})` : ""} {!athlete.isActive ? "- Pending Verification" : ""}
                </option>
              ))}
            </select>
          </div>

          {selectedAthleteAnalytics ? (
            <article className="panel" style={{ boxShadow: "none", border: "1px solid #dbe2ea" }}>
              <h3>{selectedAthleteAnalytics.fullName}</h3>
              <p>Belt Rank: {selectedAthleteAnalytics.beltRank || "-"}</p>

              <div className="panel-grid" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
                <article className="panel metric"><h3>Attendance Rate</h3><p>{selectedAthleteAnalytics.attendanceRate}%</p></article>
                <article className="panel metric"><h3>Wins</h3><p>{selectedAthleteAnalytics.winLoss.wins}</p></article>
                <article className="panel metric"><h3>Losses</h3><p>{selectedAthleteAnalytics.winLoss.losses}</p></article>
                <article className="panel metric"><h3>Total Points</h3><p>{selectedAthleteAnalytics.totalPoints}</p></article>
              </div>

              <div className="two-col-flex">
                <div className="chart-box">
                  <h4>Performance Trend</h4>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={selectedAthleteAnalytics.trend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="period" />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="score" stroke="#14329f" strokeWidth={3} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="chart-box">
                  <h4>Medal / Achievement Summary</h4>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart
                      data={Object.entries(selectedAthleteAnalytics.achievementsByType).map(([name, value]) => ({ name, value }))}
                      margin={{ top: 8, right: 16, left: 0, bottom: 6 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                        {Object.keys(selectedAthleteAnalytics.achievementsByType).map((type) => (
                          <Cell key={type} fill={achievementColor(type)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </article>
          ) : null}
        </section>
      ) : null}

      {user?.role === "ADMIN" && athleteAnalytics.length === 0 ? (
        <section className="panel page">
          <div>
            <h2>Athlete Statistics and Analytics {filters.year !== "all" ? `(${filters.year})` : ""}</h2>
            <p className="muted">No entry.</p>
          </div>
        </section>
      ) : null}

      {user?.role === "ATHLETE" && individual && hasIndividualEntries ? (
        <section className="panel page">
          <div>
            <h2>{user.fullName} Statistics and Analytics</h2>
            <p>Your personal performance summary, attendance, points, and medal analytics.</p>
          </div>

          <section className="panel-grid">
            <article className="panel metric"><h3>Attendance Rate</h3><p>{individual.attendanceRate}%</p></article>
            <article className="panel metric"><h3>Wins</h3><p>{individual.winLoss.wins}</p></article>
            <article className="panel metric"><h3>Losses</h3><p>{individual.winLoss.losses}</p></article>
            <article className="panel metric"><h3>Total Points</h3><p>{individual.totalPoints}</p></article>
          </section>

          <section className="two-col-flex">
            <div className="chart-box">
              <h3>Performance Trend</h3>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={individual.trend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="score" stroke="#14329f" strokeWidth={3} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="chart-box">
              <h3>Medal / Achievement Analytics</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={athleteAchievementData} margin={{ top: 8, right: 16, left: 0, bottom: 6 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                    {athleteAchievementData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </section>
      ) : null}

      {user?.role === "ATHLETE" && individual && !hasIndividualEntries ? (
        <section className="panel page">
          <div>
            <h2>{user.fullName} Statistics and Analytics {filters.year !== "all" ? `(${filters.year})` : ""}</h2>
            <p className="muted">No entry.</p>
          </div>
        </section>
      ) : null}
    </div>
  );
}
