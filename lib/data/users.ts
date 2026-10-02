import type { User } from "@/lib/types";

/**
 * Demo accounts — credentials are prototype-only (no real auth backend).
 * Passwords live ONLY in the seed (bcrypt-hashed into the DB) — see prisma/seed.ts.
 */
export const users: User[] = [
  {
    id: "U-001", nameEn: "Dr. Ahmed Salem", nameAr: "د. أحمد سالم",
    username: "a.salem",
    role: "physician", dept: "icu",
    specialty: { en: "Internal Medicine", ar: "باطنية" },
    email: "a.salem@hospital.sa", phone: "+966 5X XXX 1201",
    employeeId: "EMP-1021", status: "active", termsVersion: "",
    consentAt: "2025-01-01T00:00:00Z", lastLoginMin: 10, createdAt: "2024-03-12",
  },
  {
    id: "U-002", nameEn: "Sara Ahmed", nameAr: "سارة أحمد",
    username: "s.ahmed",
    role: "nurse", dept: "er",
    specialty: { en: "Emergency Nursing", ar: "تمريض طوارئ" },
    email: "s.ahmed@hospital.sa", phone: "+966 5X XXX 2088",
    employeeId: "EMP-2088", status: "active", termsVersion: "",
    consentAt: "2025-01-01T00:00:00Z", lastLoginMin: 5, createdAt: "2024-06-01",
  },
  {
    id: "U-003", nameEn: "Khaled Mohammed", nameAr: "خالد محمد",
    username: "k.mohammed",
    role: "charge_nurse", dept: "icu",
    specialty: { en: "Critical Care Nursing", ar: "تمريض عناية مركزة" },
    email: "k.mohammed@hospital.sa", phone: "+966 5X XXX 3310",
    employeeId: "EMP-3310", status: "active", termsVersion: "",
    consentAt: "2025-01-01T00:00:00Z", lastLoginMin: 62, createdAt: "2023-11-20",
  },
  {
    id: "U-004", nameEn: "Dr. Lina Haddad", nameAr: "د. لينا حداد",
    username: "l.haddad",
    role: "physician", dept: "medical",
    specialty: { en: "Endocrinology", ar: "غدد صماء وسكري" },
    email: "l.haddad@hospital.sa", phone: "+966 5X XXX 4477",
    employeeId: "EMP-4477", status: "active", termsVersion: "",
    consentAt: "2025-01-01T00:00:00Z", lastLoginMin: 25, createdAt: "2024-01-08",
  },
  {
    id: "U-005", nameEn: "Mona Alotaibi", nameAr: "منى العتيبي",
    username: "m.alotaibi",
    role: "insurance", dept: "claims",
    specialty: { en: "Claims Review", ar: "مراجعة المطالبات" },
    email: "m.alotaibi@hospital.sa", phone: "+966 5X XXX 5542",
    employeeId: "EMP-5542", status: "active", termsVersion: "",
    consentAt: "2025-01-01T00:00:00Z", lastLoginMin: 18, createdAt: "2024-09-15",
  },
  {
    id: "U-006", nameEn: "Faisal Alshammari", nameAr: "فيصل الشمري",
    username: "f.shammari",
    role: "hospital_admin", dept: "operations",
    specialty: { en: "Hospital Operations", ar: "عمليات المستشفى" },
    email: "f.shammari@hospital.sa", phone: "+966 5X XXX 6613",
    employeeId: "EMP-6613", status: "active", termsVersion: "",
    consentAt: "2025-01-01T00:00:00Z", lastLoginMin: 45, createdAt: "2023-05-30",
  },
  {
    id: "U-007", nameEn: "Rania Yousef", nameAr: "رانيا يوسف",
    username: "r.yousef",
    role: "nurse", dept: "medical",
    specialty: { en: "Medical Ward Nursing", ar: "تمريض أقسام الباطنية" },
    email: "r.yousef@hospital.sa", phone: "+966 5X XXX 7704",
    employeeId: "EMP-7704", status: "active", termsVersion: "",
    consentAt: "2025-01-01T00:00:00Z", lastLoginMin: 7, createdAt: "2025-02-14",
  },
  {
    id: "U-008", nameEn: "Omar Khalil", nameAr: "عمر خليل",
    username: "o.khalil",
    role: "admin", dept: "it",
    specialty: { en: "Systems Administration", ar: "إدارة الأنظمة" },
    email: "o.khalil@hospital.sa", phone: "+966 5X XXX 8895",
    employeeId: "EMP-8895", status: "active", termsVersion: "",
    consentAt: "2025-01-01T00:00:00Z", lastLoginMin: 3, createdAt: "2023-08-22",
  },
  {
    id: "U-009", nameEn: "Dr. Reem Farouk", nameAr: "د. ريم فاروق",
    username: "r.farouk",
    role: "physician", dept: "er",
    specialty: { en: "Emergency Medicine", ar: "طب طوارئ" },
    email: "r.farouk@hospital.sa", phone: "+966 5X XXX 9012",
    employeeId: "EMP-9012", status: "suspended", termsVersion: "",
    consentAt: "2025-01-01T00:00:00Z", lastLoginMin: 4320, createdAt: "2024-04-10",
  },
  {
    id: "U-010", nameEn: "Nadia Hassan", nameAr: "نادية حسن",
    username: "n.hassan",
    role: "nurse", dept: "icu",
    specialty: { en: "Critical Care Nursing", ar: "تمريض عناية مركزة" },
    email: "n.hassan@hospital.sa", phone: "+966 5X XXX 0143",
    employeeId: "EMP-0143", status: "active", termsVersion: "",
    consentAt: "2025-01-01T00:00:00Z", lastLoginMin: 31, createdAt: "2025-07-01",
  },
];

export const getUser = (id: string) => users.find((u) => u.id === id);
export const userName = (id: string, lang: "en" | "ar") => {
  const u = getUser(id);
  return u ? (lang === "ar" ? u.nameAr : u.nameEn) : id;
};
