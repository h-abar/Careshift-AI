import { test, expect } from "@playwright/test";
import { loginAs, logout } from "./helpers";

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3001";

test.describe("Jury Demo Walkthrough (G1 - G6)", () => {
  test.use({ baseURL: BASE_URL });

  test("G4: Nurse Home renders Story Ribbon and Quick Vitals", async ({ page }) => {
    await loginAs(page, "nurse");

    // Verify Nurse Cockpit & Story Ribbon
    await expect(page.locator("text=مسار القيمة المترابطة").or(page.locator("text=Value Creation Stream"))).toBeVisible({ timeout: 15000 });
    await expect(page.locator("text=تسجيل علامات حيوية").first()).toBeVisible();
    await expect(page.locator("text=P-1042").first()).toBeVisible();
  });

  test("G1: Handoff 3-step interactive flow (prepare -> receive -> transferred)", async ({ page }) => {
    await loginAs(page, "nurse");
    await page.goto("/handoff");

    // Verify Step 1 PREPARE
    await expect(page.locator("text=تحضير التسليم (المُسلِّم)").or(page.locator("text=PREPARE"))).toBeVisible({ timeout: 15000 });
    await expect(page.locator("text=P-1042").first()).toBeVisible();

    // Send handoff -> Step 2 RECEIVE
    const sendBtn = page.locator('button:has-text("إرسال التسليم"), button:has-text("إرسال")').first();
    await sendBtn.click();
    await expect(page.locator("text=استلام ومراجعة (المستلم)").or(page.locator("text=RECEIVE"))).toBeVisible();

    // Fill review checklist & synthesis
    const checkboxes = page.locator('input[type="checkbox"]');
    const count = await checkboxes.count();
    for (let i = 0; i < count; i++) {
      await checkboxes.nth(i).check().catch(() => {});
    }

    const synthesisArea = page.locator("textarea");
    if (await synthesisArea.isVisible()) {
      await synthesisArea.fill("استلمت المريضة نورة القحطاني P-1042 مستقرة بعد حزمة الإنتان والمضاد ومتابعة المؤشرات");
    }

    // Accept handoff -> Step 3 DONE
    const acceptBtn = page.locator('button:has-text("قبول التسليم"), button:has-text("قبول واعتماد")').first();
    await acceptBtn.click();
    await expect(page.locator("text=تم اعتماد التسليم السريري بنجاح").or(page.locator("text=Handoff Successfully Accepted"))).toBeVisible({ timeout: 10000 });
  });

  test("G2: Doctor Decision Console (cards, timers, decide modal)", async ({ page }) => {
    await loginAs(page, "doctor");

    // Verify Doctor Decision Console & Counter
    await expect(page.locator("text=لوحة القرار السريري للطبيب المعالج").or(page.locator("text=Doctor Decision Console"))).toBeVisible({ timeout: 15000 });
    await expect(page.locator("text=حالات تتطلب قرارك الطبي فوراً").or(page.locator("text=Needs Your Decision"))).toBeVisible();

    // 4-step buttons test
    const ackBtn = page.locator('button:has-text("إقرار بالاطلاع")').first();
    if (await ackBtn.isVisible()) {
      await ackBtn.click();
    }

    const bedsideBtn = page.locator('button:has-text("معاينة السرير")').first();
    if (await bedsideBtn.isVisible()) {
      await bedsideBtn.click();
    }

    const decideBtn = page.locator('button:has-text("اتخاذ القرار")').first();
    if (await decideBtn.isVisible()) {
      await decideBtn.click();
      // Verify modal
      await expect(page.locator("text=بدء حزمة الإنتان الفورية").or(page.locator("text=Start Sepsis Bundle"))).toBeVisible();
    }
  });

  test("G3: Claims & Savings screen (KPIs, savings month panel, how a claim is born)", async ({ page }) => {
    await loginAs(page, "hospital_admin");
    await page.goto("/claims");
    await expect(page.locator("text=المطالبات والوفر المالي").or(page.locator("text=Claims & Savings")).first()).toBeVisible({ timeout: 15000 });

    // Verify KPI tiles
    await expect(page.locator("text=نسبة الرفع التلقائي").or(page.locator("text=Auto-Submitted %")).first()).toBeVisible();
    await expect(page.locator("text=قبول من أول مرة").or(page.locator("text=First-Pass Acceptance")).first()).toBeVisible();

    // Verify Savings This Month & How a claim is born visual
    await expect(page.locator("text=الوفر المالي التراكمي لهذا الشهر").or(page.locator("text=Savings This Month"))).toBeVisible();
    await expect(page.locator("text=كيف تُولد المطالبة المعززة بالدليل").or(page.locator("text=How a Claim is Born"))).toBeVisible();
  });

  test("G5: Demo Walkthrough Dock operates smoothly", async ({ page }) => {
    await loginAs(page, "hospital_admin");
    await page.goto("/claims?demo=true");

    // Verify dock appears with Step 1
    await expect(page.locator("text=رسالة القيمة للجنة التحكيم").or(page.locator("text=Jury Value Takeaway"))).toBeVisible({ timeout: 15000 });

    // Click Next Step
    const nextBtn = page.locator('button:has-text("الخطوة التالية"), button:has-text("Next Step")').first();
    await nextBtn.click();
    await expect(page.locator("text=خطوة العرض 2").or(page.locator("text=Step 2"))).toBeVisible({ timeout: 10000 });
  });
});
