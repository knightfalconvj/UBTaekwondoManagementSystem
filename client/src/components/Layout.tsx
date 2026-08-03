import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { API_BASE } from "../lib/api";
import { api } from "../lib/api";
import { ChatBox } from "./ChatBox";
import { usePushNotifications } from "../hooks/usePushNotifications";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  targetId: string | null;
  isRead: boolean;
  createdAt: string;
};

const navItems = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/events", label: "Schedule" },
  { to: "/tournaments", label: "Tournaments" },
  { to: "/rankings", label: "Rankings" },
  { to: "/reports", label: "Reports" },
  { to: "/profile", label: "Profile" }
];

export function Layout() {
  const { user, logout } = useAuth();
  usePushNotifications();
  const [open, setOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationsReady, setNotificationsReady] = useState(false);
  const previousNotificationIds = useRef<string[]>([]);
  const navigate = useNavigate();

  const playNotificationSound = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;

      const audioContext = new AudioContextClass();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(660, audioContext.currentTime + 0.18);
      gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.08, audioContext.currentTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.22);

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.24);
      oscillator.onended = () => void audioContext.close();
    } catch {
      // Ignore autoplay or Web Audio restrictions.
    }
  };

  const loadNotifications = async () => {
    if (!user) return;

    try {
      const { data } = await api.get<NotificationItem[]>("/me/notifications");

      if (notificationsReady) {
        const nextIds = data.map((item) => item.id);
        const newItems = data.filter((item) => !previousNotificationIds.current.includes(item.id));
        if (newItems.length > 0) {
          playNotificationSound();
        }
        previousNotificationIds.current = nextIds;
      } else {
        previousNotificationIds.current = data.map((item) => item.id);
        setNotificationsReady(true);
      }

      setNotifications(data);
    } catch {
      setNotifications([]);
    }
  };

  useEffect(() => {
    void loadNotifications();
    const interval = window.setInterval(() => {
      void loadNotifications();
    }, 30000);

    return () => window.clearInterval(interval);
  }, [user?.id]);

  const unreadCount = useMemo(() => notifications.filter((item) => !item.isRead).length, [notifications]);
  const unreadNotifications = useMemo(() => notifications.filter((item) => !item.isRead), [notifications]);

  const resolveNotificationTarget = (item: NotificationItem) => {
    switch (item.type) {
      case "VERIFICATION_REQUEST":
      case "ATHLETE_PROFILE_UPDATED":
      case "ATHLETE_CREDENTIALS_UPDATED":
      case "ATHLETE_PHOTO_UPDATED":
        return user?.role === "ADMIN" ? "/athletes" : "/profile";
      case "ATHLETE_ABSENCE_REASON_SUBMITTED":
      case "ATTENDANCE_WARNING":
        return user?.role === "ADMIN" ? "/attendance-dashboard" : "/dashboard";
      case "VERIFICATION_APPROVED":
      case "ACCOUNT_CREATED":
      case "ACCOUNT_DISABLED":
        return "/dashboard";
      default:
        return "/dashboard";
    }
  };

  const openNotification = async (item: NotificationItem) => {
    try {
      if (!item.isRead) {
        await api.patch(`/me/notifications/${item.id}/read`);
        setNotifications((current) => current.filter((currentItem) => currentItem.id !== item.id));
      }

      setNotificationsOpen(false);
      navigate(resolveNotificationTarget(item));
    } catch {
      void loadNotifications();
    }
  };

  const markAllRead = async () => {
    const unread = notifications.filter((item) => !item.isRead);
    await Promise.all(unread.map((item) => api.patch(`/me/notifications/${item.id}/read`)));
    setNotifications((current) => current.map((item) => ({ ...item, isRead: true })));
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand-wrap">
          <button className="hamburger" onClick={() => setOpen((v) => !v)} aria-label="Toggle navigation" aria-expanded={open}>
            <span />
            <span />
            <span />
          </button>
          <Link to="/dashboard" className="brand brand-lockup" aria-label="UB Taekwondo Management Information System home">
            <img className="brand-logo" src="/ub-team-logo.png" alt="UB Taekwondo Team logo" />
            <span className="brand-text">UB Taekwondo Management Information System</span>
          </Link>
        </div>
        <div className="topbar-actions">
          <div className="notification-wrap">
            <button
              type="button"
              className={`notification-bell ${unreadCount > 0 ? "has-notifications" : "is-empty"} ${unreadCount > 0 ? "has-unread" : ""}`}
              aria-label="Notifications"
              aria-expanded={notificationsOpen}
              onClick={() => setNotificationsOpen((current) => !current)}
            >
              Notifications
              {unreadCount > 0 ? <span className="notification-badge">{unreadCount}</span> : null}
            </button>
            {notificationsOpen ? (
              <div className="notification-dropdown">
                <div className="notification-dropdown-header">
                  <strong>Notifications ({unreadCount})</strong>
                  {unreadCount > 0 ? (
                    <button type="button" className="text-button" onClick={() => void markAllRead()}>
                      Mark all read
                    </button>
                  ) : null}
                </div>
                <div className="notification-list">
                  {unreadNotifications.length === 0 ? <p className="notification-empty">No unread notifications.</p> : null}
                  {unreadNotifications.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={item.isRead ? "notification-item" : "notification-item unread"}
                      onClick={() => void openNotification(item)}
                    >
                      <span className="notification-item-title">{item.title}</span>
                      <span className="notification-item-message">{item.message}</span>
                      <span className="notification-item-time">{new Date(item.createdAt).toLocaleString()}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <div className="topbar-user">
            {user?.profilePhoto ? (
              <img className="avatar" src={`${API_BASE.replace("/api", "")}${user.profilePhoto}`} alt="Profile" />
            ) : (
              <div className="avatar placeholder">{user?.fullName?.charAt(0) ?? "U"}</div>
            )}
            <div>
              <p className="name">{user?.fullName}</p>
              <p className="role">{user?.role === "ADMIN" ? "Coach / Admin" : "Athlete"}</p>
            </div>
            <button onClick={handleLogout} className="btn-outline">Logout</button>
          </div>
        </div>
      </header>

      <div className="content-wrap">
        <aside className={`sidebar ${open ? "open" : ""}`}>
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} onClick={() => setOpen(false)} className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
              {item.label}
            </NavLink>
          ))}
          {user?.role === "ADMIN" ? <NavLink to="/athlete-comparison" onClick={() => setOpen(false)} className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>Athlete Comparison</NavLink> : null}
          {user?.role === "ADMIN" ? <NavLink to="/attendance-dashboard" onClick={() => setOpen(false)} className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>Attendance Dashboard</NavLink> : null}
          {user?.role === "ADMIN" ? <NavLink to="/athletes" onClick={() => setOpen(false)} className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>Athletes</NavLink> : null}
        </aside>

        <main className="main">
          <Outlet />
        </main>
      </div>
      <div className="signature-mark" aria-label="Project signature">knightfalconvj</div>
      <ChatBox />
    </div>
  );
}
