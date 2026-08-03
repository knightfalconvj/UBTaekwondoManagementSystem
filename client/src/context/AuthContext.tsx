import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { PropsWithChildren } from "react";
import { api } from "../lib/api";
import type { User } from "../types";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  registerAthlete: (payload: Record<string, string>) => Promise<{ message: string }>;
  logout: () => void;
  refreshMe: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = async () => {
    const token = localStorage.getItem("ubtms_token");
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const { data } = await api.get<User>("/me");
      setUser(data);
    } catch {
      localStorage.removeItem("ubtms_token");
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshMe();
  }, []);

  const login = async (email: string, password: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    const { data } = await api.post<{ token: string; user: User }>("/auth/login", {
      email: normalizedEmail,
      password
    });
    localStorage.setItem("ubtms_token", data.token);
    setUser(data.user);
  };

  const registerAthlete = async (payload: Record<string, string>) => {
    const normalizedPayload = {
      ...payload,
      email: payload.email.trim().toLowerCase(),
      fullName: payload.fullName.trim(),
      studentId: payload.studentId.trim(),
      contactNumber: payload.contactNumber.trim(),
      address: payload.address.trim(),
      emergencyContact: payload.emergencyContact.trim()
    };
    const { data } = await api.post<{ message: string; user: User }>("/auth/register", normalizedPayload);
    setUser(null);
    return { message: data.message };
  };

  const logout = () => {
    localStorage.removeItem("ubtms_token");
    setUser(null);
  };

  const value = useMemo(
    () => ({ user, loading, login, registerAthlete, logout, refreshMe }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
