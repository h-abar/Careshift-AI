"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth";
import {
  useHandoffs,
  useNotifications,
  useOrg,
  usePatientsTable,
} from "@/lib/api";
import { fmtSarK } from "@/lib/format";
import type { PatientSnapshot } from "@/lib/aggregate";
import type { Assignment } from "@/lib/types";
import { useDoctorTasks } from "@/components/doctor-task-card";
import {
  Card,
  ErrorState,
  HfStatusChip,
  IvStatusChip,
  KpiCard,
  Loading,
  Meter,
  RiskBadge,
  SectionTitle,
  Skeleton,
} from "@/components/ui";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

export default function Home() {
  const { user, can } = useAuth();
  if (!user) return <Loading />;
  // E2 — one home, branched by role (same widgets, different order/filter).
  if (user.role === "nurse") return <NurseHome />;
  if (user.role === "doctor") return <DoctorHome />;
  if (user.role === "charge_nurse") return <ChargeHome />;
  if (user.role === "admin" || user.role === "hospital_admin")
    return <CommandCenter />;
  if (!can("patients_view")) return <OversightHome />;
  return <MyWork />;
}

/* ── Shared: patients + my handoffs + my notifications ── */
function useHomeData() {
  const table = usePatientsTable();
  const ho = useHandoffs();
  const notif = useNotifications();
  const loading =
    (table.loading && !table.data) || (ho.loading && !ho.data) ||
    (notif.loading && !notif.data);
  const error = table.error ?? ho.error ?? notif.error;
  return {
    loading,
    error,
    refetch: () => {
      table.refetch();
      ho.refetch();
      notif.refetch();
    },
    snaps: table.data?.snaps ?? [],
    assignments: table.data?.assignments ?? [],
    handoffs: ho.data?.handoffs ?? [],
    notifications: notif.data?.notifications ?? [],
    unread: notif.data?.unread ?? 0,
  };
}

/** NEWS2 breakdown — the "why" behind the ordering, links to the patient. */
function WhyChip({ s }: { s: PatientSnapshot }) {
  const { t } = useI18n();
  const p = s.priority;
  if (!p) return null;
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-slate-600">
      <span className="rounded bg-[#eef2f7] px-1.5 py-0.5">
        NEWS2 {p.news2}
      </span>
      <span className="rounded bg-[#eef2f7] px-1.5 py-0.5">
        {t("home.tier")} {p.tier}
      </span>
      {p.maxSingle === 3 && (
        <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-700">
          {t("home.maxSingle")} 3
        </span>
      )}
      {p.shockSuspect && (
        <span className="rounded bg-orange-50 px-1.5 py-0.5 text-orange-700">
          SI {p.shockIndex.toFixed(2)}
        </span>
      )}
      {p.lactate != null && p.lactate >= 2 && (
        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">
          Lac {p.lactate}
        </span>
      )}
    </span>
  );
}

function SnapRow({ s, extra }: { s: PatientSnapshot; extra?: React.ReactNode }) {
  const { t, lang } = useI18n();
  const next = s.plan.find((st) => st.status !== "done");
  return (
    <Link
      href={`/patient/${s.patient.id}`}
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#eef2f7] bg-[#f8fafc] px-4 py-3 hover:border-[#0e9bb5]/40"
    >
      <div className="flex items-center gap-3 min-w-0">
        <RiskBadge level={s.risk.level} score={s.risk.score} />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[#13304d]">
            {lang === "ar" ? s.patient.nameAr : s.patient.nameEn}
            <span className="ms-2 font-mono text-xs text-slate-600">
              {s.patient.id}
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-600">
              {t(`condition.${s.risk.conditionKey}`)}
            </span>
            <WhyChip s={s} />
          </div>
        </div>
      </div>
      <div className="flex items-center gap-4 text-xs text-slate-600">
        {extra}
        {next && (
          <span className="hidden sm:block">
            {t("common.nextAction")}:{" "}
            <b className="text-[#13304d]">{t(`action.${next.actionKey}`)}</b>
          </span>
        )}
        <span className="font-mono">
          {t("common.sar")} {fmtSarK(s.insurance.exposureSar, lang)}
        </span>
      </div>
    </Link>
  );
}

/** Handoffs where I am the incoming user and the loop is not closed. */
function AwaitingAccept({ userId }: { userId: string }) {
  const { t } = useI18n();
  const { data, loading } = useHandoffs();
  if (loading && !data) return null;
  const mine = (data?.handoffs ?? []).filter(
    (h) =>
      h.incomingId === userId &&
      !["accepted", "completed", "rejected"].includes(h.status),
  );
  if (mine.length === 0) return null;
  return (
    <Card>
      <SectionTitle>{t("home.awaitingMe")}</SectionTitle>
      <div className="space-y-2">
        {mine.map((h) => (
          <Link
            key={h.id}
            href={`/handoffs/${h.id}`}
            className="flex items-center justify-between rounded-lg border border-[#eef2f7] bg-[#f8fafc] px-4 py-2.5 hover:border-[#0e9bb5]/40"
          >
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs text-[#0b7a8d]">{h.id}</span>
              <span className="text-xs text-slate-600">
                {t(`dept.${h.dept}`)} · {h.patientIds.length}{" "}
                {t("my.patients")}
              </span>
            </div>
            <HfStatusChip status={h.status} />
          </Link>
        ))}
      </div>
    </Card>
  );
}

/** My open (unread/critical) alert receipts. */
function AlertsCard({ userId }: { userId: string }) {
  const { t } = useI18n();
  const { data, loading } = useNotifications();
  if (loading && !data) return null;
  const mine = (data?.notifications ?? []).filter(
    (n) => !n.read || n.level === "critical",
  );
  void userId;
  return (
    <Card>
      <SectionTitle>{t("home.alerts")}</SectionTitle>
      {mine.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-600">
          {t("home.noAlerts")}
        </p>
      ) : (
        <div className="space-y-2">
          {mine.slice(0, 6).map((n) => (
            <div
              key={n.id}
              className="flex items-center justify-between rounded-lg border border-[#eef2f7] bg-[#f8fafc] px-4 py-2.5"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    n.level === "critical"
                      ? "bg-red-500"
                      : n.level === "warning"
                        ? "bg-amber-500"
                        : "bg-sky-500"
                  }`}
                />
                <span className="truncate text-sm text-[#13304d]">
                  {t(n.key).replace("{id}", n.patientId ?? "")}
                </span>
              </div>
              {n.patientId && (
                <Link
                  href={`/patient/${n.patientId}`}
                  className="font-mono text-xs text-[#0b7a8d] hover:underline"
                >
                  {n.patientId}
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ═══════════ E2 — Nurse home ═══════════ */
function NurseHome() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const d = useHomeData();
  if (d.loading) return <Skeleton rows={5} />;
  if (d.error) return <ErrorState onRetry={d.refetch} />;
  if (!user) return <Loading />;

  const mine = d.assignments.filter((a) => a.nurseId === user.id);
  const myPatients = d.snaps
    .filter((s) => mine.some((a) => a.patientId === s.patient.id))
    .sort((a, b) => (a.priority?.sortKey ?? 0) - (b.priority?.sortKey ?? 0));
  const critical = myPatients.filter(
    (s) => s.risk.level === "critical" || s.risk.level === "high",
  );
  const mySteps = myPatients.flatMap((s) =>
    s.plan
      .filter((st) => st.status !== "done")
      .map((st) => ({ st, s })),
  );
  const overdueSteps = mySteps.filter(
    (x) => x.s.priority?.info.overdueTasks ?? 0 > 0,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#13304d] sm:text-2xl">
          {t("my.title")}
        </h1>
        <p className="mt-0.5 text-sm text-slate-600">
          {lang === "ar" ? user.nameAr : user.nameEn} ·{" "}
          {t(`userRole.${user.role}`)} · {t(`dept.${user.dept}`)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label={t("my.patients")} value={myPatients.length} />
        <KpiCard
          label={t("my.criticalPatients")}
          value={critical.length}
          accent="text-red-600"
        />
        <KpiCard
          label={t("home.openSteps")}
          value={mySteps.length}
          accent="text-sky-700"
        />
        <KpiCard
          label={t("home.overdue")}
          value={overdueSteps.length}
          accent="text-amber-700"
        />
      </div>

      <Card>
        <SectionTitle sub={t("home.byPriority")}>
          {t("my.patients")}
        </SectionTitle>
        {myPatients.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-600">
            {t("my.nothing")}
          </p>
        )}
        <div className="space-y-2.5">
          {myPatients.map((s) => (
            <SnapRow key={s.patient.id} s={s} />
          ))}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle>{t("home.openSteps")}</SectionTitle>
          {mySteps.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-600">
              {t("my.nothing")}
            </p>
          ) : (
            <div className="space-y-2">
              {mySteps.slice(0, 6).map(({ st, s }) => (
                <Link
                  key={st.id}
                  href={`/patient/${s.patient.id}`}
                  className="flex items-center justify-between rounded-lg border border-[#eef2f7] bg-[#f8fafc] px-4 py-2.5 hover:border-[#0e9bb5]/40"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <RiskBadge level={s.risk.level} />
                    <span className="truncate text-sm text-[#13304d]">
                      {s.patient.id} · {t(`action.${st.actionKey}`)}
                    </span>
                  </div>
                  <IvStatusChip status={st.status} />
                </Link>
              ))}
            </div>
          )}
          <Link
            href="/interventions"
            className="mt-3 block text-center text-xs font-semibold text-[#0b7a8d] hover:underline"
          >
            {t("common.viewAll")} →
          </Link>
        </Card>
        <AlertsCard userId={user.id} />
      </div>

      <AwaitingAccept userId={user.id} />
    </div>
  );
}

/** E6 — open doctor action tasks, sorted by NEWS2, live wait timer. */
function DoctorTasksCard() {
  const { t, lang } = useI18n();
  const { tasks, loading } = useDoctorTasks();
  if (loading) return null;
  return (
    <Card>
      <SectionTitle sub={t("doc.taskHint")}>{t("home.needsAction")}</SectionTitle>
      {tasks.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-600">
          {t("home.noTasks")}
        </p>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <Link
              key={task.id}
              href={`/patient/${task.patientId}`}
              className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50/60 px-4 py-2.5 hover:border-red-300"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="font-mono text-xs font-bold text-red-700">
                  NEWS2 {task.score}
                </span>
                <span className="truncate text-sm text-[#13304d]">
                  {task.patient
                    ? lang === "ar"
                      ? task.patient.nameAr
                      : task.patient.nameEn
                    : task.patientId}
                  <span className="ms-2 font-mono text-xs text-slate-600">
                    {task.patientId}
                  </span>
                </span>
              </div>
              <span className="flex items-center gap-2 text-[11px]">
                {task.ladderStep > 0 && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 font-bold text-amber-800">
                    {t("doc.ladder")} {task.ladderStep}
                  </span>
                )}
                <span className="font-mono text-red-700">
                  {task.waitingMin} {t("doc.min")}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ═══════════ E2 — Doctor home ═══════════ */
function DoctorHome() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const d = useHomeData();
  if (d.loading) return <Skeleton rows={5} />;
  if (d.error) return <ErrorState onRetry={d.refetch} />;
  if (!user) return <Loading />;

  // Department list: my assigned patients + every patient in my dept.
  const dept = d.snaps
    .filter((s) =>
      d.assignments.some(
        (a) =>
          a.patientId === s.patient.id &&
          (a.physicianId === user.id || a.dept === user.dept),
      ),
    )
    .sort((a, b) => (a.priority?.sortKey ?? 0) - (b.priority?.sortKey ?? 0));
  const deteriorations = dept.filter(
    (s) =>
      (s.priority && s.priority.tier >= 2) ||
      s.priority?.info.nurseConcern,
  );
  const escalations = d.notifications.filter(
    (n) => n.level === "critical" || n.level === "warning",
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#13304d] sm:text-2xl">
          {t("home.doctorTitle")}
        </h1>
        <p className="mt-0.5 text-sm text-slate-600">
          {lang === "ar" ? user.nameAr : user.nameEn} ·{" "}
          {t(`userRole.${user.role}`)} · {t(`dept.${user.dept}`)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label={t("home.deptPatients")} value={dept.length} />
        <KpiCard
          label={t("home.newDeteriorations")}
          value={deteriorations.length}
          accent="text-red-600"
        />
        <KpiCard
          label={t("home.escalationsToMe")}
          value={escalations.length}
          accent="text-amber-700"
        />
        <KpiCard label={t("home.unread")} value={d.unread} accent="text-sky-700" />
      </div>

      {/* E6 — top widget: escalated alerts that stay open until decided */}
      <DoctorTasksCard />

      <Card>
        <SectionTitle sub={t("home.whyHint")}>
          {t("home.newDeteriorations")}
        </SectionTitle>
        {deteriorations.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-600">
            {t("my.nothing")}
          </p>
        ) : (
          <div className="space-y-2.5">
            {deteriorations.map((s) => (
              <SnapRow key={s.patient.id} s={s} />
            ))}
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle>{t("home.priorityList")}</SectionTitle>
          <div className="space-y-2.5">
            {dept.slice(0, 6).map((s) => (
              <SnapRow key={s.patient.id} s={s} />
            ))}
          </div>
          <Link
            href="/patients"
            className="mt-3 block text-center text-xs font-semibold text-[#0b7a8d] hover:underline"
          >
            {t("common.viewAll")} →
          </Link>
        </Card>
        <AlertsCard userId={user.id} />
      </div>

      <AwaitingAccept userId={user.id} />
    </div>
  );
}

/* ═══════════ E2 — Charge nurse home (shift overview) ═══════════ */
function ChargeHome() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const d = useHomeData();
  if (d.loading) return <Skeleton rows={5} />;
  if (d.error) return <ErrorState onRetry={d.refetch} />;
  if (!user) return <Loading />;

  const ward = [...d.snaps].sort(
    (a, b) => (a.priority?.sortKey ?? 0) - (b.priority?.sortKey ?? 0),
  );
  const critical = ward.filter(
    (s) => s.risk.level === "critical" || s.risk.level === "high",
  );
  // Open handoffs: created/signed but not yet accepted or completed.
  const openHandoffs = d.handoffs.filter(
    (h) => !["accepted", "completed", "rejected"].includes(h.status),
  );
  // Closed-loop gaps: alert raised but no action recorded yet, or an
  // action exists but was never completed (overdue tasks in plan).
  const gapAlerts = ward.filter(
    (s) =>
      (s.priority && s.priority.tier >= 2) ||
      s.priority?.info.nurseConcern,
  );
  const gapActions = ward.filter(
    (s) => (s.priority?.info.overdueTasks ?? 0) > 0,
  );
  // Staff workload — patients per nurse from live assignments.
  const workload = new Map<string, number>();
  for (const a of d.assignments) {
    workload.set(a.nurseId, (workload.get(a.nurseId) ?? 0) + 1);
  }
  const workloadRows = [...workload.entries()].sort((a, b) => b[1] - a[1]);
  const maxLoad = workloadRows[0]?.[1] ?? 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#13304d] sm:text-2xl">
          {t("home.chargeTitle")}
        </h1>
        <p className="mt-0.5 text-sm text-slate-600">
          {lang === "ar" ? user.nameAr : user.nameEn} ·{" "}
          {t(`userRole.${user.role}`)} · {t(`dept.${user.dept}`)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label={t("home.wardPatients")} value={ward.length} />
        <KpiCard
          label={t("my.criticalPatients")}
          value={critical.length}
          accent="text-red-600"
        />
        <KpiCard
          label={t("home.unacceptedHandoffs")}
          value={openHandoffs.length}
          accent="text-amber-700"
        />
        <KpiCard
          label={t("home.chainGaps")}
          value={gapAlerts.length + gapActions.length}
          accent="text-purple-700"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Chain gaps */}
        <Card>
          <SectionTitle sub={t("home.gapHint")}>
            {t("home.chainGaps")}
          </SectionTitle>
          {gapAlerts.length + gapActions.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-600">
              {t("home.noGaps")}
            </p>
          ) : (
            <div className="space-y-2">
              {gapAlerts.slice(0, 4).map((s) => (
                <Link
                  key={`a-${s.patient.id}`}
                  href={`/patient/${s.patient.id}`}
                  className="flex items-center justify-between rounded-lg border border-red-100 bg-red-50/60 px-4 py-2.5 hover:border-red-300"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <RiskBadge level={s.risk.level} />
                    <span className="truncate text-sm text-[#13304d]">
                      {s.patient.id} · {t("home.gapAlert")}
                    </span>
                  </div>
                  <WhyChip s={s} />
                </Link>
              ))}
              {gapActions.slice(0, 4).map((s) => (
                <Link
                  key={`t-${s.patient.id}`}
                  href={`/patient/${s.patient.id}`}
                  className="flex items-center justify-between rounded-lg border border-amber-100 bg-amber-50/60 px-4 py-2.5 hover:border-amber-300"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <RiskBadge level={s.risk.level} />
                    <span className="truncate text-sm text-[#13304d]">
                      {s.patient.id} · {t("home.gapAction")} (
                      {s.priority?.info.overdueTasks})
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>

        {/* Unaccepted handoffs */}
        <Card>
          <SectionTitle>{t("home.unacceptedHandoffs")}</SectionTitle>
          {openHandoffs.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-600">
              {t("home.noGaps")}
            </p>
          ) : (
            <div className="space-y-2">
              {openHandoffs.map((h) => (
                <Link
                  key={h.id}
                  href={`/handoffs/${h.id}`}
                  className="flex items-center justify-between rounded-lg border border-[#eef2f7] bg-[#f8fafc] px-4 py-2.5 hover:border-[#0e9bb5]/40"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-[#0b7a8d]">
                      {h.id}
                    </span>
                    <span className="text-xs text-slate-600">
                      {t(`dept.${h.dept}`)} · {h.patientIds.length}{" "}
                      {t("my.patients")}
                    </span>
                  </div>
                  <HfStatusChip status={h.status} />
                </Link>
              ))}
            </div>
          )}
          <Link
            href="/handoffs"
            className="mt-3 block text-center text-xs font-semibold text-[#0b7a8d] hover:underline"
          >
            {t("common.viewAll")} →
          </Link>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Ward priority */}
        <Card>
          <SectionTitle sub={t("home.byPriority")}>
            {t("home.wardOverview")}
          </SectionTitle>
          <div className="space-y-2.5">
            {ward.slice(0, 6).map((s) => (
              <SnapRow key={s.patient.id} s={s} />
            ))}
          </div>
          <Link
            href="/patients"
            className="mt-3 block text-center text-xs font-semibold text-[#0b7a8d] hover:underline"
          >
            {t("common.viewAll")} →
          </Link>
        </Card>

        {/* Staff workload */}
        <Card>
          <SectionTitle>{t("home.workload")}</SectionTitle>
          <div className="space-y-3 py-1">
            {workloadRows.map(([uid, n]) => (
              <div key={uid}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="font-mono text-slate-600">{uid}</span>
                  <span className="font-bold text-[#13304d]">
                    {n} {t("my.patients")}
                  </span>
                </div>
                <Meter
                  pct={Math.round((n / maxLoad) * 100)}
                  color="bg-[#0e9bb5]"
                />
              </div>
            ))}
            {workloadRows.length === 0 && (
              <p className="py-4 text-center text-sm text-slate-600">
                {t("my.nothing")}
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ── Oversight home (read-only aggregates, no PHI) ── */
function OversightHome() {
  const { t, lang } = useI18n();
  const { data: s, loading, error, refetch } = useOrg();
  if (loading && !s) return <Skeleton rows={5} />;
  if (error && !s) return <ErrorState onRetry={refetch} />;
  if (!s) return <Loading />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#13304d] sm:text-2xl">
          {t("ins.title")}
        </h1>
        <p className="mt-0.5 text-sm text-slate-600">{t("ins.subtitle")}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label={t("ins.highRisk")} value={s.clinical.elevated} />
        <KpiCard label={t("ins.docGaps")} value={s.clinical.docGaps} accent="text-amber-700" />
        <KpiCard label={t("ins.claimsRisk")} value={s.financial.claimsAtRisk} accent="text-red-600" />
        <KpiCard
          label={t("ins.estExposure")}
          value={fmtSarK(s.financial.exposureSar, lang)}
          unit={t("common.sar")}
          accent="text-red-600"
        />
      </div>
      <Card>
        <SectionTitle>{t("ins.topCases")}</SectionTitle>
        <div className="space-y-2">
          {s.claimLinked.slice(0, 8).map((c) => (
            <div
              key={c.claimId}
              className="flex items-center justify-between rounded-lg border border-[#eef2f7] bg-[#f8fafc] px-4 py-2.5"
            >
              <div className="flex items-center gap-3">
                <RiskBadge level={c.claimRisk as never} />
                <span className="font-mono text-xs text-[#0b7a8d]">{c.claimId}</span>
                <span className="font-mono text-xs text-slate-600">
                  {c.patientId} · {t(`dx.${c.dxKey}`)}
                </span>
              </div>
              <span className="font-mono text-sm font-bold text-red-600">
                {t("common.sar")} {fmtSarK(c.exposureSar, lang)}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ═══════════ Command Center — "what needs attention now?" ═══════════ */
function CommandCenter() {
  const { t, lang } = useI18n();
  const { data: s, loading, error, refetch } = useOrg();
  if (loading && !s) return <Skeleton rows={6} />;
  if (error && !s) return <ErrorState onRetry={refetch} />;
  if (!s) return <Loading />;
  const snaps = s.snaps ?? [];

  const riskMap = snaps.map((x) => ({
    x: x.risk.score,
    y: x.insurance.exposureSar / 1000,
    name: x.patient.id,
    level: x.risk.level,
  }));

  const trajectory = [
    { t: "07:00", risk: 22 },
    { t: "08:00", risk: 41 },
    { t: "09:20", risk: 87 },
    { t: "10:20", risk: 42 },
    { t: "11:30", risk: 18 },
  ];

  const cvs = s.value.careValue;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#13304d] sm:text-2xl">
            {t("cmd.title")}
          </h1>
          <p className="mt-0.5 text-sm text-slate-600">{t("cmd.pipeline")}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          {t("common.liveUnit")}
        </span>
      </div>

      {/* KPI row — hierarchy level 1 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label={t("cmd.monitored")} value={s.clinical.monitored} />
        <KpiCard label={t("cmd.highRisk")} value={s.clinical.highRisk} accent="text-orange-700" />
        <KpiCard label={t("cmd.critical")} value={s.clinical.critical} accent="text-red-600" />
        <KpiCard label={t("cmd.pending")} value={s.clinical.interventionsPending} accent="text-sky-700" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Risk map */}
        <Card>
          <SectionTitle sub={`${t("common.score")} × ${t("common.exposure")} (${t("ins.thousands")} ${t("common.sar")})`}>
            {t("cmd.clinical")} — Risk Map
          </SectionTitle>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, bottom: 0 }}>
                <CartesianGrid stroke="#eef2f7" />
                <XAxis dataKey="x" domain={[0, 100]} stroke="#94a3b8" fontSize={11} name={t("common.score")} />
                <YAxis dataKey="y" stroke="#94a3b8" fontSize={11} name={t("common.exposure")} />
                <ZAxis range={[90, 90]} />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  contentStyle={{ borderRadius: 8, border: "1px solid #e2e9f2", fontSize: 12 }}
                  formatter={(v, n) => [v, n === "x" ? t("common.score") : t("common.exposure")]}
                  labelFormatter={(_, p) => p?.[0]?.payload?.name ?? ""}
                />
                <Scatter
                  data={riskMap}
                  fill="#0e9bb5"
                  shape={(props: { cx?: number; cy?: number; payload?: { level: string } }) => {
                    const colors: Record<string, string> = {
                      critical: "#ef4444", high: "#f97316",
                      medium: "#f59e0b", low: "#10b981",
                    };
                    return (
                      <circle
                        cx={props.cx} cy={props.cy} r={7}
                        fill={colors[props.payload?.level ?? "low"]}
                        fillOpacity={0.85}
                        stroke="#fff" strokeWidth={2}
                      />
                    );
                  }}
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Actions now */}
        <Card>
          <SectionTitle sub={t("inv.loop")}>{t("cmd.pending")} — Now</SectionTitle>
          <div className="space-y-2.5">
            {snaps
              .flatMap((x) =>
                x.plan
                  .filter((st) => st.status === "in_progress" || st.status === "pending")
                  .slice(0, 1)
                  .map((st) => ({ x, st })),
              )
              .slice(0, 4)
              .map(({ x, st }) => (
                <Link
                  key={st.id}
                  href={`/patient/${x.patient.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[#eef2f7] bg-[#f8fafc] px-3 py-2.5 hover:border-[#0e9bb5]/40"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <RiskBadge level={x.risk.level} />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-[#13304d]">
                        {x.patient.id} · {t(`action.${st.actionKey}`)}
                      </div>
                      <div className="text-[11px] text-slate-600">
                        {lang === "ar" ? x.patient.nameAr : x.patient.nameEn} · {t(`role.${st.role}`)}
                      </div>
                    </div>
                  </div>
                  <IvStatusChip status={st.status} />
                </Link>
              ))}
          </div>
          <Link
            href="/interventions"
            className="mt-3 block text-center text-xs font-semibold text-[#0b7a8d] hover:underline"
          >
            {t("common.viewAll")} →
          </Link>
        </Card>
      </div>

      {/* Level 3 — monitoring row */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <SectionTitle sub="P-1042">{t("pt.trajectory")}</SectionTitle>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trajectory}>
                <CartesianGrid stroke="#eef2f7" />
                <XAxis dataKey="t" stroke="#94a3b8" fontSize={11} />
                <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={11} />
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e9f2", fontSize: 12 }} />
                <Line type="monotone" dataKey="risk" stroke="#ef4444" strokeWidth={2.5} dot={{ r: 4, fill: "#ef4444" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <SectionTitle>{t("cmd.operational")}</SectionTitle>
          <div className="flex h-40 flex-col justify-center gap-4">
            {[
              { label: t("cmd.closedLoop"), v: s.operational.closedLoopCompletion, c: "bg-emerald-500" },
              { label: t("cmd.avgTime"), v: Math.min(100, s.operational.avgInterventionMin * 3), c: "bg-[#0e9bb5]", suffix: ` ${t("common.min")}` },
              { label: t("cmd.escalations"), v: s.operational.escalations * 20, c: "bg-purple-500", suffix: "" },
            ].map((r) => (
              <div key={r.label}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-slate-600">{r.label}</span>
                  <span className="font-bold text-[#13304d]">
                    {r.label === t("cmd.avgTime") ? s.operational.avgInterventionMin : Math.round(r.v / (r.suffix ? 1 : 20)) || r.v}
                    {r.label === t("cmd.closedLoop") ? "%" : r.suffix}
                  </span>
                </div>
                <Meter pct={r.v} color={r.c} />
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionTitle>{t("cmd.financial")}</SectionTitle>
          <div className="flex h-40 flex-col justify-center gap-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600">{t("cmd.claimsDoc")}</span>
              <span className="text-2xl font-bold text-[#13304d]">{s.financial.claimsDocPct}%</span>
            </div>
            <Meter pct={s.financial.claimsDocPct} color="bg-[#1b5fad]" />
            <div className="flex items-center justify-between border-t border-[#eef2f7] pt-3">
              <span className="text-xs text-slate-600">{t("cmd.exposure")}</span>
              <span className="font-mono text-lg font-bold text-red-600">
                {t("common.sar")} {fmtSarK(s.financial.exposureSar, lang)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600">{t("cmd.careValue")}</span>
              <span className="text-lg font-bold text-[#0b7a8d]">{cvs.total}/100</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ═══════════ Fallback role home (any patients_view role) ═══════════ */
function MyWork() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { data, loading, error, refetch } = usePatientsTable();
  if (loading && !data) return <Skeleton rows={5} />;
  if (error && !data) return <ErrorState onRetry={refetch} />;
  if (!data || !user) return <Loading />;
  const { snaps, assignments } = data;

  const mine = assignments.filter(
    (a: Assignment) =>
      a.nurseId === user.id ||
      a.physicianId === user.id ||
      a.chargeNurseId === user.id,
  );
  const myPatients = snaps.filter((s) =>
    mine.some((a: Assignment) => a.patientId === s.patient.id),
  );
  const critical = myPatients.filter(
    (s) => s.risk.level === "critical" || s.risk.level === "high",
  );
  const mySteps = myPatients.flatMap((s) =>
    s.plan.filter((st) => st.status !== "done").map((st) => ({ st, s })),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#13304d] sm:text-2xl">{t("my.title")}</h1>
        <p className="mt-0.5 text-sm text-slate-600">
          {lang === "ar" ? user.nameAr : user.nameEn} · {t(`userRole.${user.role}`)} · {t(`dept.${user.dept}`)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label={t("my.patients")} value={myPatients.length} />
        <KpiCard label={t("my.criticalPatients")} value={critical.length} accent="text-red-600" />
        <KpiCard label={t("my.interventions")} value={mySteps.length} accent="text-sky-700" />
        <KpiCard label={t("my.handoffs")} value={1} accent="text-[#0b7a8d]" />
      </div>

      <Card>
        <SectionTitle sub={t("ho.subtitle")}>{t("my.patients")}</SectionTitle>
        {myPatients.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-600">{t("my.nothing")}</p>
        )}
        <div className="space-y-2.5">
          {myPatients.map((s) => (
            <SnapRow key={s.patient.id} s={s} />
          ))}
        </div>
      </Card>
    </div>
  );
}
