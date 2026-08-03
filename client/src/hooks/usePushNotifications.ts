import { useEffect, useRef } from "react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength);
}

function setBadge(count: number) {
  if (!("setAppBadge" in navigator)) return;
  if (count > 0) {
    void (navigator as Navigator & { setAppBadge(n: number): Promise<void> }).setAppBadge(count);
  } else {
    void (navigator as Navigator & { clearAppBadge(): Promise<void> }).clearAppBadge();
  }
}

export function usePushNotifications() {
  const { user } = useAuth();
  const registered = useRef(false);

  // ── Register service worker + push subscription ───────────────────────────
  useEffect(() => {
    if (!user || registered.current) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    registered.current = true;

    const register = async () => {
      try {
        const basePath = import.meta.env.BASE_URL || "/";
        const registration = await navigator.serviceWorker.register(`${basePath}sw.js`, { scope: basePath });

        if (Notification.permission === "denied") return;

        let permission: NotificationPermission = Notification.permission;
        if (permission === "default") {
          permission = await Notification.requestPermission();
        }
        if (permission !== "granted") return;

        const { data } = await api.get<{ publicKey: string }>("/push/vapid-public-key");
        if (!data.publicKey) return;

        const applicationServerKey = urlBase64ToUint8Array(data.publicKey);

        let sub = await registration.pushManager.getSubscription();
        if (!sub) {
          sub = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey
          });
        }

        const json = sub.toJSON();
        if (json.keys) {
          await api.post("/push/subscribe", {
            endpoint: sub.endpoint,
            keys: { p256dh: json.keys.p256dh, auth: json.keys.auth }
          });
        }
      } catch {
        // Push is a progressive enhancement — silently ignore
      }
    };

    void register();
  }, [user]);

  // ── Live badge sync while app is open ─────────────────────────────────────
  useEffect(() => {
    if (!user || !("setAppBadge" in navigator)) return;

    const sync = async () => {
      try {
        const { data } = await api.get<{ total: number }>("/me/unread-count");
        setBadge(data.total);
      } catch { /* ignore */ }
    };

    void sync();
    const id = setInterval(() => void sync(), 15000);

    // Clear badge when user is actively looking at the app
    const handleFocus = () => void sync();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void sync();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(id);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [user]);
}
