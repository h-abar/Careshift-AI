import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE_URL = "http://127.0.0.1:3001";
const SCREENSHOTS_DIR = path.resolve("./screenshots");
const ARTIFACT_DIR = "C:/Users/laaba/.gemini/antigravity-ide/brain/a8db7489-1ea5-494c-acca-69b21483b60e";

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function loginUser(page, username, password) {
  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
  
  // If already logged in, clear cookies
  const isUserMenu = await page.locator('[aria-label="user menu"]').isVisible().catch(() => false);
  if (isUserMenu) {
    await page.context().clearCookies();
    await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
  }

  // Check if quick login button exists
  const quickBtn = page.locator(`button:has-text("${username}")`);
  if (await quickBtn.isVisible().catch(() => false)) {
    await quickBtn.click();
  } else {
    // Fill form
    await page.locator('input[autocomplete="username"]').fill(username);
    await page.locator('input[autocomplete="current-password"]').fill(password);
    await page.locator('button[type="submit"]').click();
  }

  await page.waitForTimeout(1500);

  // Handle PDPL consent if present
  const consentBtn = page.locator('button:has-text("أوافق"), button:has-text("متابعة")');
  if (await consentBtn.isVisible().catch(() => false)) {
    await consentBtn.first().click();
    await page.waitForTimeout(500);
  }

  // Handle Terms if present
  const termsBtn = page.locator('button:has-text("أوافق على الشروط")');
  if (await termsBtn.isVisible().catch(() => false)) {
    await termsBtn.first().click();
    await page.waitForTimeout(500);
  }
}

async function saveScreenshot(page, filename) {
  const localPath = path.join(SCREENSHOTS_DIR, filename);
  const artifactPath = path.join(ARTIFACT_DIR, filename);
  await page.screenshot({ path: localPath, fullPage: false });
  try {
    fs.copyFileSync(localPath, artifactPath);
  } catch (e) {
    console.warn("Could not copy to artifact dir:", e.message);
  }
  console.log(`Saved screenshot: ${localPath}`);
}

async function main() {
  console.log("Launching Chromium for Jury Demo screenshots...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 850 },
    locale: "ar-SA",
  });
  const page = await context.newPage();

  try {
    // ── 1. NURSE HOME SCREENSHOT ──
    console.log("1. Capturing Nurse Home...");
    await loginUser(page, "s.ahmed", "Demo@2088");
    await page.waitForTimeout(2000);
    await saveScreenshot(page, "01_nurse_home.png");

    // ── 2. HANDOFF SEND SCREENSHOT (Step 1 PREPARE) ──
    console.log("2. Capturing Handoff Send (Prepare)...");
    await page.goto(`${BASE_URL}/handoff`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await saveScreenshot(page, "02_handoff_send.png");

    // ── 3. HANDOFF RECEIVE SCREENSHOT (Step 2 RECEIVE) ──
    console.log("3. Capturing Handoff Receive (Side-by-side)...");
    const sendBtn = page.locator('button:has-text("إرسال التسليم")');
    if (await sendBtn.first().isVisible().catch(() => false)) {
      await sendBtn.first().click();
      await page.waitForTimeout(1000);
    }
    await saveScreenshot(page, "03_handoff_receive.png");

    // ── 4. DOCTOR DECISION CONSOLE (Card) SCREENSHOT ──
    console.log("4. Capturing Doctor Decision Console...");
    await loginUser(page, "a.salem", "Demo@1021");
    await page.waitForTimeout(2000);
    await saveScreenshot(page, "04_doctor_decision_console.png");

    // ── 5. DOCTOR DECIDE MODAL SCREENSHOT ──
    console.log("5. Capturing Doctor Decide Modal...");
    // Tap Acknowledge -> Bedside -> Decide on first case
    const ackBtn = page.locator('button:has-text("إقرار بالاطلاع")').first();
    if (await ackBtn.isVisible().catch(() => false)) {
      await ackBtn.click();
      await page.waitForTimeout(500);
    }
    const bedsideBtn = page.locator('button:has-text("معاينة السرير")').first();
    if (await bedsideBtn.isVisible().catch(() => false)) {
      await bedsideBtn.click();
      await page.waitForTimeout(500);
    }
    const decideBtn = page.locator('button:has-text("اتخاذ القرار")').first();
    if (await decideBtn.isVisible().catch(() => false)) {
      await decideBtn.click();
      await page.waitForTimeout(800);
    }
    // Select Sepsis Bundle in modal
    const sepsisOption = page.locator('button:has-text("بدء حزمة الإنتان")').first();
    if (await sepsisOption.isVisible().catch(() => false)) {
      await sepsisOption.click();
      await page.waitForTimeout(500);
    }
    await saveScreenshot(page, "05_doctor_decide_modal.png");

    // Close modal
    const cancelModal = page.locator('button:has-text("إلغاء")').first();
    if (await cancelModal.isVisible().catch(() => false)) {
      await cancelModal.click();
      await page.waitForTimeout(500);
    }

    // ── 6. CLAIMS & SAVINGS SCREENSHOT ──
    console.log("6. Capturing Claims & Savings...");
    await page.goto(`${BASE_URL}/claims`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await saveScreenshot(page, "06_claims_and_savings.png");

    // ── 7. PAYER VERIFY SCREENSHOT ──
    console.log("7. Capturing Payer Verify...");
    await loginUser(page, "m.alotaibi", "Demo@5542");
    await page.goto(`${BASE_URL}/payer`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    // Click verify evidence button
    const verifyBtn = page.locator('button:has-text("فحص وتدقيق سلامة الأدلة"), button:has-text("Verify Evidence")').first();
    if (await verifyBtn.isVisible().catch(() => false)) {
      await verifyBtn.click();
      await page.waitForTimeout(800);
    }
    await saveScreenshot(page, "07_payer_verify.png");

    // ── 8. DEMO MODE CAPTION SCREENSHOT ──
    console.log("8. Capturing Demo Mode Dock & Caption...");
    // Launch demo mode walkthrough
    const demoLaunchBtn = page.locator('button:has-text("تفعيل مسار العرض"), button:has-text("Launch Jury")');
    if (await demoLaunchBtn.isVisible().catch(() => false)) {
      await demoLaunchBtn.click();
      await page.waitForTimeout(800);
    }
    await saveScreenshot(page, "08_demo_mode_caption.png");

    console.log("All 8 screenshots successfully captured!");
  } catch (err) {
    console.error("Error during screenshot capture:", err);
  } finally {
    await browser.close();
  }
}

main();
