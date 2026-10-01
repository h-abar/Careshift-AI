# Careshift AI — Jury Demo Script (7–10 min) · عرض للجنة التحكيم

All data is simulated. كل البيانات تجريبية محاكاة.

## Reset before the demo · إعادة الضبط قبل العرض

```bash
npm run db:reset        # drop + migrate + seed (dev DB)
# or compose demo: docker compose down -v && docker compose up --build -d
```

Demo accounts (dev only · للتطوير فقط):

| Role | Username | Password | Sees |
|---|---|---|---|
| System Admin | `o.khalil` | `Demo@8895` | users, audit, everything |
| Physician | `a.salem` | `Demo@1021` | patients, risk, handoffs |
| Charge Nurse | `k.mohammed` | `Demo@3310` | handoff mgmt, vitals edit |
| Nurse | `s.ahmed` | `Demo@2088` | patients, interventions |
| Nurse 2 | `r.yousef` | `Demo@7704` | incoming handoff |
| Insurance | `m.alotaibi` | `Demo@5542` | claims, evidence (no PHI list) |
| Hospital Admin | `f.shammari` | `Demo@6613` | org analytics, audit |
| Suspended | `r.farouk` | `Demo@9012` | shows blocked login |

---

## English run (right column = Arabic cues)

### 0:00 — Login & consent
Login as `s.ahmed` (nurse). **First-login consent dialog appears** — point at
it: *"PDPL transparency: every user acknowledges simulated data, recorded per
account."* Accept. Toggle EN/AR in the header — full RTL layout flips.

### 1:00 — The P-1042 story (command center)
On the command center, P-1042 tops the risk list. *"This patient drifted
87 → 42 → 18 on our deterioration score during DKA management — the system
caught it before the crash."* Open **P-1042**: vitals, labs, risk history
chart. Click **Reassess** — new RiskAssessment row, live score.

### 3:00 — Intervention → closed loop
The intervention plan for P-1042 shows steps in lifecycle states
(pending → in progress → done; overdue auto-derived). Complete a step →
status + actor + timestamp persist. *"Every action is an auditable event —
the loop closes, not just flags."*

### 4:00 — SBAR handoff
Go to Handoffs → open the pending handoff → **SBAR summary generated
server-side** (situation/background/assessment/recommendation, ar+en),
per-patient checklist, sign-off. Log out → in as `r.yousef` (incoming
nurse) → accept. Timeline shows create → signoff → accept with actors.

### 5:30 — Insurance: denial → appeal with evidence
Log in as `m.alotaibi`. *"Insurance sees claims and evidence readiness —
not the patient list."* Open a denied claim → **denial reason codes
(ar/en)** → appeal with a justification → upload a PDF (validated by magic
bytes + AV hook). Readiness score recomputes toward ~96%.

### 7:00 — Notifications
Risk-threshold reassessment already fired alerts to the assigned nurse +
physician — per-user receipts (one user's dismiss can't hide another's
alert). Deep links jump to the patient/claim.

### 7:45 — Admin: view-as + audit
Log in as `o.khalil`. Users page → **View as** `s.ahmed` → impersonation
banner persists, every action audited under both identities. Stop view-as.
Audit page → filter by `a.salem`, export CSV (`/api/audit/export`).

### 8:30 — Security & compliance close
- Login `r.farouk` → suspended, blocked + audited.
- Security headers (nonce CSP), CSRF origin checks, DB rate limits,
  lockout with Retry-After.
- `docs/compliance.md` maps controls to PDPL/NCA ECC ("oriented", honest).
- `/api/health` + `/api/ready` + `/api/metrics`, pino JSON logs, redaction.

### 9:00 — Event-based claims (P-1042)
*"The claim is built from what the patient actually lived, not from a
report."*
1. Patient page → **Journey timeline**: the deterioration story as
   hash-chained events (vitals → NEWS2 → alert → escalation →
   intervention), filterable by clinical/nursing/physician/medication/
   billing.
2. Insurance → open the P-1042 claim → **Assemble claim**: every line
   appears with its supporting event ids and evidence chain. A manual
   line with no events stays flagged — no events, no line.
3. **Checks**: readiness %, one billed-not-lived and one lived-not-billed
   finding — fix them, watch readiness climb.
4. **Package**: insurer view shows lines + event summaries (no patient
   name), click **verify** — hash proof passes. FHIR JSON / PDF export.
5. **Adjudicate (simulated)**: a denial comes back with an official
   NPHIES code → **appeal evidence** shows which existing events answer
   it → appeal carries those event ids only → resubmit creates `CL-x-v2`,
   the denied original stays untouched.
6. **Claim Integrity KPIs**: event-backed %, denials by NPHIES category,
   late-entry rate — all computed live from the registry.

**Closing line:** *"Careshift AI closes the gap between detecting danger,
acting on it, and proving the outcome — clinically and to the payer."*

---

## العربية — النسخة المختصرة

1. **تسجيل الدخول والإقرار** (`s.ahmed`): نافذة إقرار البيانات التجريبية تظهر
   أول مرة وتُسجَّل لكل حساب. بدّل اللغة — الواجهة تقلب RTL بالكامل.
2. **قصة P-1042**: درجة التدهور 87→42→18 اكتُشفت قبل الانهيار. افتح المريض،
   شاهد العلامات والمختبرات ومخطط التاريخ، واضغط «إعادة تقييم».
3. **التدخل والحلقة المغلقة**: خطوات التدخل لها دورة حياة كاملة (معلق → جارٍ →
   منجز، والمتأخر يُشتق تلقائيًا) بأختام زمنية وفاعل.
4. **تسليم SBAR**: ملخص SBAR يُولَّد في الخادم (عربي/إنجليزي)، قائمة تحقق
   لكل مريض، توقيع، ثم قبول من الممرضة المستلمة `r.yousef`.
5. **التأمين** (`m.alotaibi`): المطالِب يرى الجاهزية والأدلة دون قائمة
   المرضى. مطالبة مرفوضة → رموز رفض → استئناف + رفع PDF (تحقق بصمة الملف
   وماسح فيروسي) → الجاهزية ~96%.
6. **الإشعارات**: تنبيهات عتبة الخطر تصل للممرضة والطبيب المكلّفين — إيصالات
   لكل مستخدم، فإخفاء أحدهما لا يخفي عن الآخر.
7. **الإدارة** (`o.khalil`): «عرض كـ» للمستخدمين مع شريط انتحال ومسار تدقيق
   مزدوج، تصدير سجل التدقيق CSV، ومراجعة صلاحيات `/api/admin/access-review`.
8. **الأمان والامتثال**: رفض الدخول للحساب الموقوف `r.farouk`، CSP بنونس،
   حماية CSRF، حدود معدل بقاعدة البيانات، قفل مع Retry-After، و
   `docs/compliance.md` يربط الضوابط بـPDPL/NCA ECC (توجّه وليس اعتمادًا).

9. **مطالبات مبنية على الأحداث** (P-1042): «المطالبة تُبنى مما عاشه
   المريض فعلًا» — الجدول الزمني للأحداث المقيّدة بالتجزئة، «جمّع
   المطالبة» يبني كل سطر من أحداث حقيقية، فحص الاتساق الاتجاهي، حزمة
   التأمين بأقل بيانات لازمة مع زر «تحقق» للتجزئة، تحكيم محاكى برمز نفيس
   رسمي → استئناف من الأحداث الموجودة فقط → إعادة تقديم كنسخة جديدة،
   ومؤشرات سلامة المطالبات الحية.

**الخاتمة:** «كيرشيفت AI يسد الفجوة بين اكتشاف الخطر وتنفيذ التدخل وإثبات
أثره — سريريًا وتأمينيًا.»
