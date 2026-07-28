// weeklyReportCron.js
//
// Every Sunday at 11:59 PM (server local time), automatically generate the
// weekly PDF report, store it under backend/reports/, and register it in
// the `reports` table so it shows up in "old reports" listings.
//
// Wiring it up (in server.js):
//   const { startWeeklyReportCron } = require("./weeklyReportCron");
//   startWeeklyReportCron(pool);

const fs = require("fs");
const path = require("path");
const cron = require("node-cron");
const { getFullReportData } = require("./reportData");
const { generatePdfReport } = require("./reportGenerator");
const { logAudit } = require("./audit");

const REPORTS_DIR = path.join(__dirname, "reports");

function ensureReportsDir() {
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }
}

async function generateAndStoreWeeklyReport(pool) {
  ensureReportsDir();

  const reportData = await getFullReportData(pool, "weekly");
  const pdfBuffer = await generatePdfReport(reportData);

  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "_");
  const fileName = `Weekly_Report_${dateStr}.pdf`;
  const filePath = path.join(REPORTS_DIR, fileName);

  fs.writeFileSync(filePath, pdfBuffer);

  await pool.query(
    `
    INSERT INTO reports (report_type, format, file_name, period_start, period_end, generated_by)
    VALUES ('weekly', 'pdf', $1, $2, $3, 'system-cron')
    `,
    [fileName, reportData.periodStart, reportData.periodEnd],
  );

  await logAudit(pool, {
    actorEmail: "system-cron",
    actorRole: "system",
    action: "WEEKLY_REPORT_GENERATED",
    description: `Automatic weekly report generated: ${fileName}`,
    metadata: { fileName },
  });

  console.log(`[weeklyReportCron] Generated ${fileName}`);
  return fileName;
}

function startWeeklyReportCron(pool) {
  // "59 23 * * 0" = 23:59 every Sunday
  cron.schedule("59 23 * * 0", async () => {
    try {
      await generateAndStoreWeeklyReport(pool);
    } catch (err) {
      console.error("[weeklyReportCron] Failed to generate weekly report:", err);
    }
  });
  console.log("[weeklyReportCron] Scheduled: every Sunday at 23:59");
}

module.exports = {
  startWeeklyReportCron,
  generateAndStoreWeeklyReport,
  REPORTS_DIR,
};
