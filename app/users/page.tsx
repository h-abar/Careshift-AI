"use client";

import Link from "next/link";
import { useState } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth";
import { patchJson, postJson, useUsers } from "@/lib/api";
import { Avatar, Card, ConfirmDialog, Loading, SectionTitle } from "@/components/ui";
import { Icon } from "@/components/icons";
import type { RoleKey, User } from "@/lib/types";

type U = Omit<User, "password"> & { locked: boolean };

const ROLES: RoleKey[] = [
  "admin", "physician", "nurse", "charge_nurse", "insurance", "hospital_admin",
];
const DEPTS = ["icu", "er", "medical", "surgical", "claims", "operations", "it"];

const fmtLast = (min: number | null, t: (k: string) => string) =>
  min === null
    ? t("usr.never")
    : min < 60
      ? `${min} ${t("usr.minAgo")}`
      : min < 1440
        ? `${Math.floor(min / 60)} ${t("usr.hrAgo")}`
        : `${Math.floor(min / 1440)} ${t("usr.dayAgo")}`;

const EMPTY = {
  username: "", nameEn: "", nameAr: "", roleKey: "nurse" as RoleKey,
  dept: "icu", employeeId: "", email: "", phone: "", password: "",
};

export default function UsersPage() {
  const { t, lang } = useI18n();
  const { can } = useAuth();
  const { data, refetch } = useUsers();
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [dept, setDept] = useState("");
  const [status, setStatus] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<
    | { kind: "role"; u: U; role: RoleKey }
    | { kind: "suspend" | "reactivate"; u: U }
    | null
  >(null);
  const [editing, setEditing] = useState<U | null>(null);
  const [editForm, setEditForm] = useState({
    specialtyEn: "", specialtyAr: "", email: "", phone: "",
  });
  const [tempPw, setTempPw] = useState<string | null>(null);

  if (!can("users_manage"))
    return <p className="py-20 text-center text-slate-400">{t("common.noAccess")}</p>;
  if (!data) return <Loading />;
  const users = data.users;

  const filtered = users.filter((u) => {
    const name = (lang === "ar" ? u.nameAr : u.nameEn).toLowerCase();
    return (
      (!q || name.includes(q.toLowerCase()) || u.employeeId.includes(q)) &&
      (!role || u.role === role) &&
      (!dept || u.dept === dept) &&
      (!status || u.status === status)
    );
  });

  const patch = async (id: string, body: Record<string, string>) => {
    try {
      await patchJson(`/api/users/${id}`, body);
      refetch();
    } catch {
      /* audited server-side; UI just keeps prior state */
    }
  };

  const resetPw = async (u: U) => {
    try {
      const r = await postJson<{ tempPassword?: string }>(
        `/api/users/${u.id}/reset-password`,
        {},
      );
      if (r.tempPassword) setTempPw(r.tempPassword);
    } catch {
      /* server rejects → no password shown */
    }
  };

  const unlock = async (u: U) => {
    try {
      await postJson(`/api/users/${u.id}/unlock`, {});
      refetch();
    } catch {}
  };

  const userName = (u: U) => (lang === "ar" ? u.nameAr : u.nameEn);

  const runConfirm = () => {
    if (!confirm) return;
    if (confirm.kind === "role") patch(confirm.u.id, { roleKey: confirm.role });
    else
      patch(confirm.u.id, {
        status: confirm.kind === "suspend" ? "suspended" : "active",
      });
    setConfirm(null);
  };

  const saveEdit = async () => {
    if (!editing) return;
    await patch(editing.id, editForm);
    setEditing(null);
  };

  const create = async () => {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      await postJson("/api/users", form);
      setShowNew(false);
      setForm(EMPTY);
      refetch();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "error");
    } finally {
      setBusy(false);
    }
  };

  const select =
    "rounded-lg border border-[#e2e9f2] bg-white px-3 py-2 text-sm text-slate-600 outline-none focus:border-[#0e9bb5]/50";
  const actBtn =
    "rounded-md border border-[#e2e9f2] px-2 py-1 text-[11px] font-semibold text-slate-600 hover:border-[#0e9bb5]/40 hover:text-[#0e9bb5]";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle>{t("usr.title")}</SectionTitle>
        <button
          onClick={() => setShowNew(true)}
          className="rounded-lg bg-[#13304d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1b5fad] transition-colors"
        >
          + {t("usr.add")}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative">
          <Icon name="search" className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("usr.search")}
            className="w-56 rounded-lg border border-[#e2e9f2] bg-white py-2 ps-9 pe-3 text-sm outline-none focus:border-[#0e9bb5]/50"
          />
        </div>
        <select value={role} onChange={(e) => setRole(e.target.value)} className={select}>
          <option value="">{t("usr.allRoles")}</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>{t(`userRole.${r}`)}</option>
          ))}
        </select>
        <select value={dept} onChange={(e) => setDept(e.target.value)} className={select}>
          <option value="">{t("usr.allDepts")}</option>
          {DEPTS.map((d) => (
            <option key={d} value={d}>{t(`dept.${d}`)}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={select}>
          <option value="">{t("usr.allStatus")}</option>
          <option value="active">{t("ustatus.active")}</option>
          <option value="suspended">{t("ustatus.suspended")}</option>
        </select>
      </div>

      {/* Desktop table */}
      <Card className="hidden !p-0 md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#e2e9f2] text-xs text-slate-500">
              {[t("usr.user"), t("usr.role"), t("usr.dept"), t("usr.status"), t("usr.lastLogin"), t("usr.actions")].map((h) => (
                <th key={h} className="px-4 py-3 text-start font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id} className="border-b border-[#eef2f7] last:border-0 hover:bg-[#f8fafc]">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={lang === "ar" ? u.nameAr : u.nameEn} />
                    <div>
                      <div className="font-semibold text-[#13304d]">
                        {lang === "ar" ? u.nameAr : u.nameEn}
                      </div>
                      <div className="font-mono text-[11px] text-slate-400">{u.employeeId}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={u.role}
                    onChange={(e) => {
                      const v = e.target.value as RoleKey;
                      if (v !== u.role) setConfirm({ kind: "role", u, role: v });
                      else e.target.value = u.role;
                    }}
                    className="rounded-md border border-transparent bg-transparent px-1 py-0.5 text-xs text-slate-600 hover:border-[#e2e9f2]"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{t(`userRole.${r}`)}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={u.dept}
                    onChange={(e) => patch(u.id, { dept: e.target.value })}
                    className="rounded-md border border-transparent bg-transparent px-1 py-0.5 text-xs text-slate-600 hover:border-[#e2e9f2]"
                  >
                    {DEPTS.map((d) => (
                      <option key={d} value={d}>{t(`dept.${d}`)}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold border ${
                    u.status === "active"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-slate-100 text-slate-500 border-slate-200"
                  }`}>
                    {t(`ustatus.${u.status}`)}
                  </span>
                  {u.locked && (
                    <span className="ms-1.5 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600">
                      {t("usr.locked")}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500">{fmtLast(u.lastLoginMin, t)}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Link
                      href={`/users/${u.id}`}
                      className="text-xs font-semibold text-[#0e9bb5] hover:underline"
                    >
                      {t("usr.profile")} →
                    </Link>
                    <button
                      onClick={() => {
                        setEditing(u);
                        setEditForm({
                          specialtyEn: u.specialty.en,
                          specialtyAr: u.specialty.ar,
                          email: u.email,
                          phone: u.phone,
                        });
                      }}
                      className={actBtn}
                    >
                      {t("usr.edit")}
                    </button>
                    <button
                      onClick={() =>
                        setConfirm({
                          kind: u.status === "active" ? "suspend" : "reactivate",
                          u,
                        })
                      }
                      className={`${actBtn} ${u.status === "active" ? "!text-red-500 hover:!border-red-300" : "!text-emerald-600 hover:!border-emerald-300"}`}
                    >
                      {u.status === "active" ? t("usr.suspend") : t("usr.reactivate")}
                    </button>
                    {u.locked && (
                      <button onClick={() => unlock(u)} className={actBtn}>
                        {t("usr.unlock")}
                      </button>
                    )}
                    <button onClick={() => resetPw(u)} className={actBtn}>
                      {t("usr.resetPw")}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Mobile cards */}
      <div className="space-y-2.5 md:hidden">
        {filtered.map((u) => (
          <div key={u.id}>
            <Link href={`/users/${u.id}`}>
              <Card className="!p-3.5 flex items-center gap-3">
                <Avatar name={lang === "ar" ? u.nameAr : u.nameEn} size="h-10 w-10" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-[#13304d]">
                    {lang === "ar" ? u.nameAr : u.nameEn}
                  </div>
                  <div className="text-xs text-slate-500">
                    {t(`userRole.${u.role}`)} · {t(`dept.${u.dept}`)}
                  </div>
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                  u.status === "active"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-slate-100 text-slate-500 border-slate-200"
                }`}>
                  {t(`ustatus.${u.status}`)}
                </span>
              </Card>
            </Link>
          </div>
        ))}
      </div>

      {/* Create-user modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#13304d]/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="mb-4 text-base font-bold text-[#13304d]">
              {t("usr.newUser")}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  ["username", t("usr.username")],
                  ["nameEn", t("usr.nameEn")],
                  ["nameAr", t("usr.nameAr")],
                  ["employeeId", t("usr.employeeId")],
                  ["email", t("usr.email")],
                  ["phone", t("usr.phone")],
                  ["password", t("usr.password")],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="block">
                  <span className="mb-1 block text-[11px] font-semibold text-slate-500">
                    {label}
                  </span>
                  <input
                    type={k === "password" ? "password" : "text"}
                    value={form[k]}
                    onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                    className="w-full rounded-lg border border-[#e2e9f2] bg-[#f8fafc] px-3 py-2 text-sm outline-none focus:border-[#0e9bb5]/50"
                  />
                </label>
              ))}
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-slate-500">
                  {t("usr.role")}
                </span>
                <select
                  value={form.roleKey}
                  onChange={(e) =>
                    setForm({ ...form, roleKey: e.target.value as RoleKey })
                  }
                  className="w-full rounded-lg border border-[#e2e9f2] bg-[#f8fafc] px-3 py-2 text-sm outline-none"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{t(`userRole.${r}`)}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-slate-500">
                  {t("usr.dept")}
                </span>
                <select
                  value={form.dept}
                  onChange={(e) => setForm({ ...form, dept: e.target.value })}
                  className="w-full rounded-lg border border-[#e2e9f2] bg-[#f8fafc] px-3 py-2 text-sm outline-none"
                >
                  {DEPTS.map((d) => (
                    <option key={d} value={d}>{t(`dept.${d}`)}</option>
                  ))}
                </select>
              </label>
            </div>
            {err && (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">
                {err}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowNew(false);
                  setErr("");
                }}
                className="rounded-lg border border-[#e2e9f2] px-4 py-2 text-sm font-semibold text-slate-600"
              >
                {t("usr.cancel")}
              </button>
              <button
                onClick={create}
                disabled={busy}
                className="rounded-lg bg-[#0e9bb5] px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
              >
                {t("usr.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation for role change / suspend / reactivate */}
      {confirm && (
        <ConfirmDialog
          title={
            confirm.kind === "role"
              ? t("usr.confirmRole")
                  .replace("{name}", userName(confirm.u))
                  .replace("{role}", t(`userRole.${confirm.role}`))
              : t(
                  confirm.kind === "suspend"
                    ? "usr.confirmSuspend"
                    : "usr.confirmReactivate",
                ).replace("{name}", userName(confirm.u))
          }
          danger={confirm.kind !== "reactivate"}
          confirmLabel={t("common.confirm")}
          cancelLabel={t("usr.cancel")}
          onConfirm={runConfirm}
          onCancel={() => {
            setConfirm(null);
            refetch(); // restore the select to the persisted value
          }}
        />
      )}

      {/* Edit specialty / contact */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#13304d]/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="mb-4 text-base font-bold text-[#13304d]">
              {t("usr.edit")} — {userName(editing)}
            </h3>
            <div className="grid gap-3">
              {(
                [
                  ["specialtyEn", t("usr.specialtyEn")],
                  ["specialtyAr", t("usr.specialtyAr")],
                  ["email", t("usr.email")],
                  ["phone", t("usr.phone")],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="block">
                  <span className="mb-1 block text-[11px] font-semibold text-slate-500">
                    {label}
                  </span>
                  <input
                    value={editForm[k]}
                    onChange={(e) =>
                      setEditForm({ ...editForm, [k]: e.target.value })
                    }
                    className="w-full rounded-lg border border-[#e2e9f2] bg-[#f8fafc] px-3 py-2 text-sm outline-none focus:border-[#0e9bb5]/50"
                  />
                </label>
              ))}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setEditing(null)}
                className="rounded-lg border border-[#e2e9f2] px-4 py-2 text-sm font-semibold text-slate-600"
              >
                {t("usr.cancel")}
              </button>
              <button
                onClick={saveEdit}
                className="rounded-lg bg-[#0e9bb5] px-4 py-2 text-sm font-bold text-white"
              >
                {t("usr.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* One-time temporary password */}
      {tempPw && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#13304d]/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-base font-bold text-[#13304d]">
              {t("usr.tempPw")}
            </h3>
            <p className="mt-2 rounded-lg bg-[#f8fafc] px-3 py-2 font-mono text-sm text-[#13304d] select-all">
              {tempPw}
            </p>
            <p className="mt-2 text-[11px] text-amber-600">
              {t("usr.tempPwNote")}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => void navigator.clipboard?.writeText(tempPw)}
                className="rounded-lg border border-[#e2e9f2] px-4 py-2 text-sm font-semibold text-slate-600"
              >
                {t("usr.copy")}
              </button>
              <button
                onClick={() => setTempPw(null)}
                className="rounded-lg bg-[#0e9bb5] px-4 py-2 text-sm font-bold text-white"
              >
                {t("usr.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
