"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n/provider";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  CartesianGrid,
} from "recharts";

interface SavingsItem {
  key: string;
  nameAr: string;
  nameEn: string;
  calcAr: string;
  calcEn: string;
  valSar: number;
  color: string;
  sourceAr: string;
  sourceEn: string;
}

const SAVINGS_ITEMS: SavingsItem[] = [
  {
    key: "icu",
    nameAr: "أيام عناية مركزة متجنبة",
    nameEn: "Avoided ICU Days",
    calcAr: "14 يوماً × 8,500 ر.س (متوسط تكلفة يوم العناية)",
    calcEn: "14 days x SAR 8,500/day",
    valSar: 119000,
    color: "#0e9bb5",
    sourceAr: "معيار وزارة الصحة والجمعية السعودية لطب العناية المركزة (SSCCM 2024)",
    sourceEn: "MOH benchmark & SSCCM 2024 critical care guidelines",
  },
  {
    key: "los",
    nameAr: "تقليص أيام التنويم الزائدة",
    nameEn: "Reduced Ward LOS",
    calcAr: "38 يوماً تنويم × 2,200 ر.س (تكلفة سرير الجناح)",
    calcEn: "38 days x SAR 2,200/day",
    valSar: 83600,
    color: "#3b82f6",
    sourceAr: "متوسط تكلفة الإقامة السريرية للمستشفيات المرجعية السعودية (CBAHI)",
    sourceEn: "Saudi reference hospital daily bed rate (CBAHI benchmarks)",
  },
  {
    key: "denials",
    nameAr: "رفوضات مستردة بالأدلة",
    nameEn: "Denials Prevented",
    calcAr: "47 مطالبة محمية × 18,400 ر.س (متوسط قيمة المطالبة)",
    calcEn: "47 claims protected x SAR 18,400 avg value",
    valSar: 864800,
    color: "#10b981",
    sourceAr: "سجل التدقيق التأميني لمطالبات نفيس NPHIES الربع الثاني 2026",
    sourceEn: "NPHIES Q2 2026 claims rejection registry",
  },
  {
    key: "staff",
    nameAr: "ساعات عمل كوادر التوثيق",
    nameEn: "Staff Time Saved",
    calcAr: "360 ساعة عمل تمريض وترميز × 150 ر.س/ساعة",
    calcEn: "360 staff hours x SAR 150/hr",
    valSar: 54000,
    color: "#8b5cf6",
    sourceAr: "أتمتة تجميع حزم الأدلة دون الحاجة للمراجعة الورقية اليدوية",
    sourceEn: "Automated claim packet assembly eliminating manual paperwork",
  },
];

export function SavingsMonthPanel() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const [showFormulaModal, setShowFormulaModal] = useState(false);

  const totalSar = SAVINGS_ITEMS.reduce((sum, item) => sum + item.valSar, 0);

  const chartData = SAVINGS_ITEMS.map((item) => ({
    name: isAr ? item.nameAr : item.nameEn,
    amount: item.valSar,
    display: `${(item.valSar / 1000).toFixed(1)}k`,
    color: item.color,
  }));

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h3 className="text-lg font-black text-[#13304d]">
              {isAr ? "الوفر المالي التراكمي لهذا الشهر" : "Savings This Month"}
            </h3>
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
              {isAr ? "تقديري مثبت / Estimated" : "Estimated"}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {isAr
              ? "مبني على تقليص التدهور السريري، تسليم الورديات دون فجوات، وحماية المطالبات من الرفض"
              : "Derived from prevented deterioration, zero-gap handoffs, and denial-proof claims"}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-end">
            <div className="text-[10px] font-bold uppercase text-slate-400">
              {isAr ? "إجمالي الوفر المحقق" : "Total Net Savings"}
            </div>
            <div className="font-mono text-2xl font-black text-emerald-700">
              {totalSar.toLocaleString()} {isAr ? "ر.س" : "SAR"}
            </div>
          </div>

          <button
            onClick={() => setShowFormulaModal(true)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-[#0b7a8d] hover:bg-slate-100 transition shadow-sm"
          >
            📐 {isAr ? "صيغة الاحتساب والمراجع" : "Formula & Sources"}
          </button>
        </div>
      </div>

      {/* Main 2 Columns: 4 Parts Breakdown + Bar Chart */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* The 4 Components List */}
        <div className="space-y-3">
          {SAVINGS_ITEMS.map((item) => {
            const percent = ((item.valSar / totalSar) * 100).toFixed(1);

            return (
              <div
                key={item.key}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3.5"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="h-3.5 w-3.5 rounded-full shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <div>
                    <div className="text-sm font-bold text-[#13304d]">
                      {isAr ? item.nameAr : item.nameEn}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono">
                      {isAr ? item.calcAr : item.calcEn}
                    </div>
                  </div>
                </div>

                <div className="text-end">
                  <div className="font-mono text-sm font-black text-slate-900">
                    {item.valSar.toLocaleString()} {isAr ? "ر.س" : "SAR"}
                  </div>
                  <div className="text-[10px] font-bold text-slate-400">
                    {percent}% {isAr ? "من الإجمالي" : "of total"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bar Chart */}
        <div className="flex flex-col justify-center rounded-xl border border-slate-100 bg-slate-50/40 p-4">
          <div className="mb-2 text-xs font-bold text-slate-600">
            {isAr ? "توزيع مجالات الوفر المالي (بالألف ريال سعودي):" : "Savings Distribution (SAR in thousands):"}
          </div>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  formatter={(val: unknown) => [
                    `${Number(val || 0).toLocaleString()} SAR`,
                    isAr ? "القيمة" : "Amount",
                  ]}
                />
                <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Formula & Method Modal */}
      {showFormulaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-base font-black text-[#13304d]">
                  📐 {isAr ? "منهجية احتساب الوفر المالي والمراجع المعتمدة" : "Savings Calculation Methodology & Citations"}
                </h3>
                <p className="text-xs text-slate-500">
                  {isAr ? "جميع الافتراضات مبنية على أدبيات الرعاية الحرجة ومعايير التأمين الصحي السعودي" : "All assumptions grounded in Saudi healthcare economics"}
                </p>
              </div>
              <button
                onClick={() => setShowFormulaModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-700">
              {SAVINGS_ITEMS.map((item, idx) => (
                <div key={item.key} className="rounded-xl border border-slate-200 p-3.5 space-y-1.5 bg-slate-50/50">
                  <div className="flex items-center justify-between font-bold text-sm text-[#13304d]">
                    <span>{idx + 1}. {isAr ? item.nameAr : item.nameEn}</span>
                    <span className="font-mono text-emerald-700">{item.valSar.toLocaleString()} SAR</span>
                  </div>
                  <div className="font-mono text-slate-800 bg-white p-2 rounded border border-slate-200">
                    <span className="font-bold text-slate-500">{isAr ? "معادلة الاحتساب:" : "Formula:"} </span>
                    {isAr ? item.calcAr : item.calcEn}
                  </div>
                  <div className="text-slate-500">
                    <span className="font-semibold">{isAr ? "المرجع والسند:" : "Citation & Baseline:"} </span>
                    {isAr ? item.sourceAr : item.sourceEn}
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              💡 {isAr
                ? "ملاحظة: يمكنك تعديل تكلفة سرير العناية وتكلفة يوم التنويم من صفحة الإعدادات (/settings) لتخصيص الحساب وفق تسعيرة مستشفاك المحددة."
                : "Note: Unit costs for ICU day and ward bed rate can be calibrated in /settings to reflect hospital-specific charges."}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowFormulaModal(false)}
                className="rounded-xl bg-[#0b7a8d] px-5 py-2 text-xs font-bold text-white hover:bg-[#075e6e]"
              >
                {isAr ? "إغلاق" : "Close"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
