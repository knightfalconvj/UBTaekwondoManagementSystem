import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const initial = {
  title: "",
  type: "TRAINING",
  date: "",
  startTime: "",
  endTime: "",
  venue: "",
  remarks: "",
  status: "UPCOMING"
};

export function EventsPage() {
  const { user } = useAuth();
  const [events, setEvents] = useState<any[]>([]);
  const [attendanceRows, setAttendanceRows] = useState<any[]>([]);
  const [myAttendance, setMyAttendance] = useState<any[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [form, setForm] = useState(initial);
  const [busyAttendanceKey, setBusyAttendanceKey] = useState("");

  const load = async () => {
    const [eventsRes, myAttendanceRes] = await Promise.all([
      api.get("/events"),
      user?.role === "ATHLETE" ? api.get("/events/attendance/mine") : Promise.resolve({ data: [] })
    ]);

    setEvents(eventsRes.data);
    setMyAttendance(myAttendanceRes.data);

    if (!selectedEventId && eventsRes.data.length > 0) {
      setSelectedEventId(eventsRes.data[0].id);
    }
  };

  useEffect(() => {
    void load();
  }, [user?.role]);

  const loadAttendanceRows = async (eventId: string) => {
    if (!eventId || user?.role !== "ADMIN") return;
    const { data } = await api.get(`/events/${eventId}/attendance`);
    setAttendanceRows(data.rows);
  };

  useEffect(() => {
    void loadAttendanceRows(selectedEventId);
  }, [selectedEventId, user?.role]);

  const createEvent = async (event: FormEvent) => {
    event.preventDefault();
    await api.post("/events", {
      ...form,
      date: new Date(form.date).toISOString()
    });
    setForm(initial);
    await load();
  };

  const remove = async (id: string) => {
    await api.delete(`/events/${id}`);
    await load();
  };

  const editEvent = async (ev: any) => {
    const title = prompt("Title:", ev.title) ?? ev.title;
    const venue = prompt("Venue:", ev.venue) ?? ev.venue;
    const status = prompt("Status (UPCOMING/COMPLETED):", ev.status) ?? ev.status;
    if (!title || !venue || !status) return;

    await api.patch(`/events/${ev.id}`, { title, venue, status });
    await load();
  };

  const markAttendance = async (eventId: string, userId: string, present: boolean) => {
    setBusyAttendanceKey(`${eventId}:${userId}`);
    try {
      await api.post("/events/attendance", { eventId, userId, present });
      await Promise.all([loadAttendanceRows(eventId), load()]);
    } finally {
      setBusyAttendanceKey("");
    }
  };

  const reviewReason = async (attendanceId: string, status: "VALID" | "INVALID") => {
    const coachComment = prompt("Coach comment (optional):", "") ?? "";
    await api.patch(`/events/attendance/${attendanceId}/reason-review`, {
      status,
      coachComment
    });
    await loadAttendanceRows(selectedEventId);
  };

  const submitAbsenceReason = async (attendanceId: string, currentReason?: string | null) => {
    const reason = prompt("Provide your reason for absence:", currentReason ?? "") ?? "";
    if (!reason.trim()) return;
    await api.patch(`/events/attendance/${attendanceId}/reason`, { reason });
    await load();
  };

  return (
    <div className="page">
      {user?.role === "ADMIN" ? (
        <section className="panel">
          <h2>Create Schedule or Event</h2>
          <form className="form-grid two-col" onSubmit={createEvent}>
            <label>Title<input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
            <label>Type<select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option>TRAINING</option><option>TOURNAMENT</option><option>TEAM_EVENT</option></select></label>
            <label>Date<input required type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
            <label>Start Time<input required type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></label>
            <label>End Time<input required type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} /></label>
            <label>Venue<input required value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} /></label>
            <label>Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option>UPCOMING</option><option>COMPLETED</option></select></label>
            <label>Remarks<input value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></label>
            <button className="btn-primary full" type="submit">Save Event</button>
          </form>
        </section>
      ) : null}

      <section className="panel">
        <h2>Published Schedule</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Title</th><th>Type</th><th>Date</th><th>Time</th><th>Venue</th><th>Status</th>{user?.role === "ADMIN" ? <th>Action</th> : null}</tr></thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev.id}>
                  <td>{ev.title}</td>
                  <td>{ev.type}</td>
                  <td>{new Date(ev.date).toLocaleDateString()}</td>
                  <td>{ev.startTime} - {ev.endTime}</td>
                  <td>{ev.venue}</td>
                  <td>{ev.status}</td>
                  {user?.role === "ADMIN" ? (
                    <td>
                      <button className="btn-outline" onClick={() => editEvent(ev)}>Edit</button>
                      <button className="btn-danger" onClick={() => remove(ev.id)}>Delete</button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {user?.role === "ADMIN" ? (
        <section className="panel">
          <h2>Coach Attendance Marking</h2>
          <div className="inline-form">
            <label>
              Event
              <select value={selectedEventId} onChange={(e) => setSelectedEventId(e.target.value)}>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>{ev.title} - {new Date(ev.date).toLocaleDateString()}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Athlete</th>
                  <th>Belt Rank</th>
                  <th>Status</th>
                  <th>Absence Reason</th>
                  <th>Coach Validation</th>
                  <th>Mark</th>
                </tr>
              </thead>
              <tbody>
                {attendanceRows.map((row) => {
                  const attendance = row.attendance;
                  const status = attendance ? (attendance.present ? "Present" : "Absent") : "Not marked";
                  const isBusy = busyAttendanceKey === `${selectedEventId}:${row.userId}`;

                  return (
                    <tr key={row.userId}>
                      <td>{row.fullName}</td>
                      <td>{row.beltRank || "-"}</td>
                      <td>{status}</td>
                      <td>{attendance?.absenceReason ?? "-"}</td>
                      <td>
                        {attendance?.reasonStatus === "PENDING" ? "Pending review" : attendance?.reasonStatus ?? "NONE"}
                        {attendance?.coachComment ? <p className="muted-note">{attendance.coachComment}</p> : null}
                      </td>
                      <td>
                        <div className="button-row">
                          <button className="btn-outline" disabled={isBusy} onClick={() => markAttendance(selectedEventId, row.userId, true)}>Present</button>
                          <button className="btn-danger" disabled={isBusy} onClick={() => markAttendance(selectedEventId, row.userId, false)}>Absent</button>
                          {attendance?.reasonStatus === "PENDING" ? (
                            <>
                              <button className="btn-primary" onClick={() => reviewReason(attendance.id, "VALID")}>Mark Valid</button>
                              <button className="btn-outline" onClick={() => reviewReason(attendance.id, "INVALID")}>Mark Invalid</button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {attendanceRows.length === 0 ? (
                  <tr>
                    <td colSpan={6}>No athletes available.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {user?.role === "ATHLETE" ? (
        <section className="panel">
          <h2>My Attendance and Absence Reasons</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Reason</th>
                  <th>Validation</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {myAttendance.map((record) => (
                  <tr key={record.id}>
                    <td>{record.event.title}</td>
                    <td>{new Date(record.event.date).toLocaleDateString()}</td>
                    <td>{record.present ? "Present" : "Absent"}</td>
                    <td>{record.absenceReason ?? "-"}</td>
                    <td>
                      {record.reasonStatus}
                      {record.coachComment ? <p className="muted-note">{record.coachComment}</p> : null}
                    </td>
                    <td>
                      {!record.present ? (
                        <button className="btn-outline" onClick={() => submitAbsenceReason(record.id, record.absenceReason)}>Submit / Update Reason</button>
                      ) : "-"}
                    </td>
                  </tr>
                ))}
                {myAttendance.length === 0 ? (
                  <tr>
                    <td colSpan={6}>No attendance records yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
