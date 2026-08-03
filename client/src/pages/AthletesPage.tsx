import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { BELT_RANKS } from "../types";

export function AthletesPage() {
  const { user } = useAuth();
  const [athletes, setAthletes] = useState<any[]>([]);
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    studentId: "",
    contactNumber: "",
    address: "",
    emergencyContact: "",
    beltRank: BELT_RANKS[0] as string
  });

  const load = async () => {
    const { data } = await api.get("/users/athletes");
    setAthletes(data);
  };

  useEffect(() => {
    if (user?.role === "ADMIN") void load();
  }, [user?.role]);

  const createAthlete = async (event: FormEvent) => {
    event.preventDefault();
    await api.post("/users/athletes", form);
    setForm({ ...form, fullName: "", email: "", password: "", studentId: "" });
    await load();
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    await api.patch(`/users/athletes/${id}`, { isActive: !isActive });
    await load();
  };

  const verifyAthlete = async (id: string) => {
    await api.patch(`/users/athletes/${id}`, { isActive: true });
    await load();
  };

  const removeAthlete = async (id: string) => {
    await api.delete(`/users/athletes/${id}`);
    await load();
  };

  const resetAthletePassword = async (athlete: any) => {
    const newPassword = prompt(`Set a new password for ${athlete.fullName} (minimum 8 characters):`);
    if (!newPassword) return;

    if (newPassword.length < 8) {
      alert("Password must be at least 8 characters.");
      return;
    }

    await api.patch(`/users/athletes/${athlete.id}/reset-password`, { password: newPassword });
    alert(`Password reset for ${athlete.fullName}.`);
  };

  const editAthlete = async (athlete: any) => {
    const fullName = prompt("Full name:", athlete.fullName) ?? athlete.fullName;
    const beltRank = prompt("Belt rank:", athlete.athleteProfile?.beltRank ?? BELT_RANKS[0]) ?? athlete.athleteProfile?.beltRank;
    if (!fullName || !beltRank) return;

    await api.patch(`/users/athletes/${athlete.id}`, {
      fullName,
      beltRank
    });
    await load();
  };

  if (user?.role !== "ADMIN") {
    return <div className="page"><p>Admin access only.</p></div>;
  }

  return (
    <div className="page">
      <section className="panel">
        <h2>Create Athlete Account</h2>
        <form className="form-grid two-col" onSubmit={createAthlete}>
          <label>Full Name<input required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></label>
          <label>Email<input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <label>Password<input required type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
          <label>Student ID<input required value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })} /></label>
          <label>Contact Number<input required value={form.contactNumber} onChange={(e) => setForm({ ...form, contactNumber: e.target.value })} /></label>
          <label>Address<input required value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
          <label>Emergency Contact<input required value={form.emergencyContact} onChange={(e) => setForm({ ...form, emergencyContact: e.target.value })} /></label>
          <label>Belt Rank<select value={form.beltRank} onChange={(e) => setForm({ ...form, beltRank: e.target.value })}>{BELT_RANKS.map((rank) => <option key={rank}>{rank}</option>)}</select></label>
          <button className="btn-primary full" type="submit">Create Athlete</button>
        </form>
      </section>

      <section className="panel">
        <h2>Pending Athlete Verification</h2>
        <p>These athletes are waiting for coach approval before they can sign in.</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Student ID</th><th>Action</th></tr></thead>
            <tbody>
              {athletes.filter((athlete) => !athlete.isActive).map((athlete) => (
                <tr key={athlete.id}>
                  <td>{athlete.fullName}</td>
                  <td>{athlete.email}</td>
                  <td>{athlete.athleteProfile?.studentId}</td>
                  <td>
                    <button className="btn-primary" type="button" onClick={() => verifyAthlete(athlete.id)}>
                      Verify & Add to System
                    </button>
                  </td>
                </tr>
              ))}
              {athletes.filter((athlete) => !athlete.isActive).length === 0 ? (
                <tr><td colSpan={4}>No pending verification requests.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>Registered Athletes</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Student ID</th><th>Belt</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {athletes.map((a) => (
                <tr key={a.id}>
                  <td>{a.fullName}</td>
                  <td>{a.athleteProfile?.studentId}</td>
                  <td>{a.athleteProfile?.beltRank}</td>
                  <td>{a.isActive ? "Active" : "Disabled"}</td>
                  <td>
                    <button className="btn-outline" type="button" onClick={() => editAthlete(a)}>Edit</button>
                    <button className="btn-outline" type="button" onClick={() => resetAthletePassword(a)}>Reset Password</button>
                    <button className="btn-outline" type="button" onClick={() => toggleActive(a.id, a.isActive)}>{a.isActive ? "Disable" : "Enable"}</button>
                    <button className="btn-danger" type="button" onClick={() => removeAthlete(a.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
