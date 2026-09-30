"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { can, type PermKey } from "@/lib/permissions";
import { postJson } from "@/lib/api";
import type { User } from "@/lib/types";

type SessionUser = Omit<User, "password">;

interface Auth {
  /** Currently authenticated user (null until session check resolves). */
  user: SessionUser | null;
  /** The admin who is impersonating, if viewing as someone else. */
  impersonator: SessionUser | null;
  loggedIn: boolean;
  loading: boolean;
  /** Server login — bcrypt-verified credentials → httpOnly session cookie. */
  login: (
    username: string,
    password: string,
  ) => Promise<"ok" | "invalid" | "locked">;
  logout: () => Promise<void>;
  /** Admin "view as" — server-issued impersonation session, audit-logged. */
  switchUser: (id: string) => Promise<boolean>;
  can: (perm: PermKey) => boolean;
}

const Ctx = createContext<Auth>({
  user: null,
  impersonator: null,
  loggedIn: false,
  loading: true,
  login: async () => "invalid",
  logout: async () => {},
  switchUser: async () => false,
  can: () => false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [impersonator, setImpersonator] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((d) => {
        setUser(d.user ?? null);
        setImpersonator(d.impersonator ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    try {
      const d = await postJson<{ user: SessionUser }>("/api/auth/login", {
        username,
        password,
      });
      setUser(d.user);
      setImpersonator(null);
      return "ok" as const;
    } catch (e) {
      return (e instanceof Error && e.message === "locked"
        ? "locked"
        : "invalid") as "locked" | "invalid";
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await postJson("/api/auth/logout", {});
    } finally {
      setUser(null);
      setImpersonator(null);
    }
  }, []);

  const switchUser = useCallback(async (id: string) => {
    try {
      const d = await postJson<{ user: SessionUser; impersonator: SessionUser }>(
        "/api/auth/switch",
        { userId: id },
      );
      setUser(d.user);
      setImpersonator(d.impersonator);
      return true;
    } catch {
      return false;
    }
  }, []);

  const value = useMemo<Auth>(
    () => ({
      user,
      impersonator,
      loggedIn: !!user,
      loading,
      login,
      logout,
      switchUser,
      can: (p) => (user ? can(user.role, p) : false),
    }),
    [user, impersonator, loading, login, logout, switchUser],
  );

  if (loading) return null;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
