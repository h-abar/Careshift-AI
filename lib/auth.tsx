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
import { postJson, ApiError } from "@/lib/api";
import type { User } from "@/lib/types";

type SessionUser = Omit<User, "password">;

interface Auth {
  /** Currently authenticated user (null until session check resolves). */
  user: SessionUser | null;
  /** The admin who is impersonating, if viewing as someone else. */
  impersonator: SessionUser | null;
  loggedIn: boolean;
  loading: boolean;
  /** Server login — bcrypt-verified credentials → httpOnly session cookie.
   *  Returns "captcha" when the username is locked but the server will accept
   *  a captchaToken (0.6 — configured verifier only). */
  login: (
    username: string,
    password: string,
    captchaToken?: string,
  ) => Promise<"ok" | "invalid" | "locked" | "captcha">;
  logout: () => Promise<void>;
  /** Admin "view as" — server-issued impersonation session, audit-logged. */
  switchUser: (id: string) => Promise<boolean>;
  /** Ends impersonation — restores the original admin session. */
  stopSwitch: () => Promise<boolean>;
  /** PDPL demo-data disclaimer — records consentAt on the user. */
  consent: () => Promise<boolean>;
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
  stopSwitch: async () => false,
  consent: async () => false,
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

  const login = useCallback(
    async (username: string, password: string, captchaToken?: string) => {
      try {
        const d = await postJson<{ user: SessionUser }>("/api/auth/login", {
          username,
          password,
          ...(captchaToken ? { captchaToken } : {}),
        });
        setUser(d.user);
        setImpersonator(null);
        return "ok" as const;
      } catch (e) {
        if (e instanceof Error && e.message === "locked")
          return (e instanceof ApiError && e.code === "captcha_required"
            ? "captcha"
            : "locked") as "captcha" | "locked";
        return "invalid" as const;
      }
    },
    [],
  );

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

  const stopSwitch = useCallback(async () => {
    try {
      const d = await postJson<{ user: SessionUser }>(
        "/api/auth/switch/stop",
        {},
      );
      setUser(d.user);
      setImpersonator(null);
      return true;
    } catch {
      return false;
    }
  }, []);

  const consent = useCallback(async () => {
    try {
      const d = await postJson<{ consentAt: string }>("/api/consent", {});
      setUser((u) => (u ? { ...u, consentAt: d.consentAt } : u));
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
      stopSwitch,
      consent,
      can: (p) => (user ? can(user.role, p) : false),
    }),
    [user, impersonator, loading, login, logout, switchUser, stopSwitch, consent],
  );

  if (loading) return null;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
