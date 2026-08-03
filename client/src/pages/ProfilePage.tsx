import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { BELT_RANKS } from "../types";

export function ProfilePage() {
  const { user, refreshMe } = useAuth();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [credentialsSaving, setCredentialsSaving] = useState(false);
  const [credentialsMessage, setCredentialsMessage] = useState("");
  const [credentialsError, setCredentialsError] = useState("");

  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [contactNumber, setContactNumber] = useState(user?.athleteProfile?.contactNumber ?? "");
  const [address, setAddress] = useState(user?.athleteProfile?.address ?? "");
  const [emergencyContact, setEmergencyContact] = useState(user?.athleteProfile?.emergencyContact ?? "");
  const [beltRank, setBeltRank] = useState<string>(user?.athleteProfile?.beltRank ?? BELT_RANKS[0]);
  const [email, setEmail] = useState(user?.email ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  const roleLabel = useMemo(() => (user?.role === "ADMIN" ? "Coach / Admin" : "Athlete"), [user?.role]);

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      if (user?.role === "ATHLETE") {
        await api.patch("/me", { fullName, contactNumber, address, emergencyContact, beltRank });
      } else {
        await api.patch("/me", { fullName });
      }
      await refreshMe();
      setMessage("Profile saved.");
    } catch {
      setError("Unable to save profile.");
    } finally {
      setSaving(false);
    }
  };

  const onPhotoUpload = async (file: File) => {
    setUploading(true);
    setError("");
    setMessage("");
    try {
      const formData = new FormData();
      formData.append("photo", file);
      await api.post("/me/photo", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      await refreshMe();
      setMessage("Profile photo updated.");
    } catch {
      setError("Photo upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const deletePhoto = async () => {
    setUploading(true);
    setError("");
    setMessage("");
    try {
      await api.delete("/me/photo");
      await refreshMe();
      setMessage("Profile photo removed.");
    } catch {
      setError("Failed to remove photo.");
    } finally {
      setUploading(false);
    }
  };

  const saveCredentials = async (event: FormEvent) => {
    event.preventDefault();
    setCredentialsSaving(true);
    setCredentialsError("");
    setCredentialsMessage("");

    const nextEmail = email.trim().toLowerCase();
    const emailChanged = nextEmail.length > 0 && nextEmail !== (user?.email ?? "").toLowerCase();
    const passwordChanged = newPassword.trim().length > 0;

    if (!currentPassword) {
      setCredentialsError("Enter your current password to save account changes.");
      setCredentialsSaving(false);
      return;
    }

    if (!emailChanged && !passwordChanged) {
      setCredentialsError("No account changes to save.");
      setCredentialsSaving(false);
      return;
    }

    if (passwordChanged && newPassword !== confirmNewPassword) {
      setCredentialsError("New password and confirmation must match.");
      setCredentialsSaving(false);
      return;
    }

    try {
      await api.patch("/me/credentials", {
        currentPassword,
        ...(emailChanged ? { email: nextEmail } : {}),
        ...(passwordChanged ? { newPassword } : {})
      });
      await refreshMe();
      setCredentialsMessage("Account credentials updated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setEmail(nextEmail);
    } catch {
      setCredentialsError("Unable to update account credentials.");
    } finally {
      setCredentialsSaving(false);
    }
  };

  return (
    <div className="page">
      <section className="panel">
        <h2>My Profile</h2>
        <p>{roleLabel}</p>

        <form className="form-grid two-col" onSubmit={saveProfile}>
          <label>
            Full Name
            <input required value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </label>

          {user?.role === "ATHLETE" ? (
            <>
              <label>
                Contact Number
                <input required value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} />
              </label>
              <label>
                Address
                <input required value={address} onChange={(e) => setAddress(e.target.value)} />
              </label>
              <label>
                Emergency Contact
                <input required value={emergencyContact} onChange={(e) => setEmergencyContact(e.target.value)} />
              </label>
              <label>
                Belt Rank
                <select value={beltRank} onChange={(e) => setBeltRank(e.target.value)}>
                  {BELT_RANKS.map((rank) => (
                    <option key={rank}>{rank}</option>
                  ))}
                </select>
              </label>
            </>
          ) : null}

          {error ? <p className="error full">{error}</p> : null}
          {message ? <p className="success full">{message}</p> : null}
          <button className="btn-primary full" disabled={saving} type="submit">
            {saving ? "Saving..." : "Save Profile"}
          </button>
        </form>
      </section>

      <section className="panel">
        <h3>Profile Photo</h3>
        <div className="inline-form">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onPhotoUpload(file);
            }}
            disabled={uploading}
          />
          <button className="btn-danger" type="button" onClick={deletePhoto} disabled={uploading}>
            Delete Photo
          </button>
        </div>
      </section>

      {user ? (
        <section className="panel">
          <h3>Account Security</h3>
          <p>Change your account email or password.</p>

          <form className="form-grid two-col" onSubmit={saveCredentials}>
            <label>
              Email
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label>
              Current Password
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </label>
            <label>
              New Password
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </label>
            <label>
              Confirm New Password
              <input
                type="password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
              />
            </label>

            {credentialsError ? <p className="error full">{credentialsError}</p> : null}
            {credentialsMessage ? <p className="success full">{credentialsMessage}</p> : null}
            <button className="btn-primary full" disabled={credentialsSaving} type="submit">
              {credentialsSaving ? "Saving..." : "Save Account Settings"}
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
