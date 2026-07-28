// reportGenerator.js
//
// Turns the data from reportData.js into a PDF (PDFKit) or Excel (ExcelJS)
// file. Both return a Buffer so callers can either stream it as an HTTP
// response or write it to disk (used by the weekly cron job).

const PDFKit = require("pdfkit");
const ExcelJS = require("exceljs");
const fs = require("fs");
const path = require("path");

const COMPANY_NAME = process.env.COMPANY_NAME || "RoboManthan";
// Optional path to a logo image (PNG/JPG). If missing, the PDF just skips it.
const COMPANY_LOGO_PATH = process.env.COMPANY_LOGO_PATH || "";

function fmtDate(d) {
  if (!d) return "";
  const date = new Date(d);
  return date.toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDateOnly(d) {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

function buildFileName(reportData, format) {
  const dateStr = fmtDateOnly(reportData.periodEnd || new Date());
  const label = (reportData.periodType || "custom").replace(/[^a-zA-Z0-9]/g, "_");
  const ext = format === "excel" ? "xlsx" : "pdf";
  return `${label}_Report_${dateStr}.${ext}`;
}

/**
 * Generate the PDF report. Returns a Buffer.
 */
function generatePdfReport(reportData) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFKit({ margin: 40, size: "A4" });
      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // ---- Header: logo + company name ----
      if (COMPANY_LOGO_PATH && fs.existsSync(COMPANY_LOGO_PATH)) {
        try {
          doc.image(COMPANY_LOGO_PATH, 40, 30, { width: 60 });
          doc.fontSize(18).text(COMPANY_NAME, 110, 40);
        } catch (e) {
          doc.fontSize(18).text(COMPANY_NAME, 40, 40);
        }
      } else {
        doc.fontSize(18).text(COMPANY_NAME, 40, 40);
      }

      doc.moveDown();
      doc.fontSize(14).text("Inventory Report", { align: "left" });
      doc
        .fontSize(10)
        .fillColor("gray")
        .text(
          `Period: ${(reportData.periodType || "custom").toUpperCase()}  |  ${fmtDateOnly(reportData.periodStart)} to ${fmtDateOnly(reportData.periodEnd)}`,
        )
        .text(`Date Generated: ${fmtDate(new Date())}`)
        .fillColor("black");
      doc.moveDown();

      const sectionTitle = (title) => {
        doc.moveDown(0.5);
        doc.fontSize(13).fillColor("#1a1a1a").text(title, { underline: true });
        doc.fontSize(9).fillColor("black");
        doc.moveDown(0.3);
      };

      const row = (cols) => {
        doc.fontSize(9).text(cols.join("   |   "));
      };

      // ---- Summary ----
      sectionTitle("Summary");
      const totalStock = reportData.currentInventory.reduce((s, p) => s + Number(p.stock), 0);
      row([`Total Components: ${reportData.currentInventory.length}`]);
      row([`Total Units In Stock: ${totalStock}`]);
      row([`Low Stock Components: ${reportData.lowStock.length}`]);
      row([`Components Used In Period: ${reportData.componentsUsed.reduce((s, r) => s + Number(r.quantity), 0)}`]);
      row([`Stock Received In Period: ${reportData.stockReceived.reduce((s, r) => s + Number(r.quantity), 0)}`]);
      row([`Returns In Period: ${reportData.returns.length}`]);
      row([`Replacements In Period: ${reportData.replacements.length}`]);

      // ---- Current Inventory ----
      sectionTitle("Current Inventory");
      if (reportData.currentInventory.length === 0) {
        row(["No components on file."]);
      }
      reportData.currentInventory.forEach((p) => {
        row([`${p.name}`, `Stock: ${p.stock}`, `Min: ${p.minQuantity}`, `Damaged: ${p.damaged || 0}`]);
      });

      // ---- Low Stock ----
      sectionTitle("Low Stock");
      if (reportData.lowStock.length === 0) {
        row(["No components below minimum quantity."]);
      }
      reportData.lowStock.forEach((p) => {
        row([`${p.name}`, `Stock: ${p.stock}`, `Min: ${p.minQuantity}`]);
      });

      // ---- Components Used ----
      sectionTitle("Components Used");
      if (reportData.componentsUsed.length === 0) {
        row(["No usage recorded in this period."]);
      }
      reportData.componentsUsed.forEach((u) => {
        row([
          `${u.productName}`,
          `Qty: ${u.quantity}`,
          `${u.issueType}${u.projectName ? " - " + u.projectName : ""}`,
          `By: ${u.employeeNames || "-"}`,
          fmtDate(u.issueDate),
        ]);
      });

      // ---- Stock Received ----
      sectionTitle("Stock Received");
      if (reportData.stockReceived.length === 0) {
        row(["No stock received in this period."]);
      }
      reportData.stockReceived.forEach((r) => {
        row([
          `${r.productName}`,
          `Qty: ${r.quantity}`,
          `Supplier: ${r.supplierName || "-"}`,
          `Invoice: ${r.invoiceNumber || "-"}`,
          fmtDate(r.receivedDate),
        ]);
      });

      // ---- Returns ----
      sectionTitle("Returns");
      if (reportData.returns.length === 0) {
        row(["No returns in this period."]);
      }
      reportData.returns.forEach((r) => {
        row([
          `Issue #${r.issueId}`,
          `${r.issueType}${r.projectName ? " - " + r.projectName : ""}`,
          `By: ${r.employeeNames || "-"}`,
          fmtDate(r.returnedDate),
        ]);
      });

      // ---- Replacement History ----
      sectionTitle("Replacement History");
      if (reportData.replacements.length === 0) {
        row(["No replacements in this period."]);
      }
      reportData.replacements.forEach((r) => {
        row([
          `${r.oldProductName}${r.oldSerialNumber ? " (SN " + r.oldSerialNumber + ")" : ""} -> ${r.newProductName}${r.newSerialNumber ? " (SN " + r.newSerialNumber + ")" : ""}`,
          `By: ${r.employeeName || r.requesterEmail || "-"}`,
          `Reason: ${r.reason || "-"}`,
          fmtDate(r.requestDate),
        ]);
      });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Generate the Excel report (multi-sheet workbook). Returns a Buffer.
 */
async function generateExcelReport(reportData) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = COMPANY_NAME;
  workbook.created = new Date();

  const summarySheet = workbook.addWorksheet("Summary");
  summarySheet.columns = [
    { header: "Metric", key: "metric", width: 35 },
    { header: "Value", key: "value", width: 20 },
  ];
  const totalStock = reportData.currentInventory.reduce((s, p) => s + Number(p.stock), 0);
  summarySheet.addRows([
    { metric: "Report Period", value: (reportData.periodType || "custom").toUpperCase() },
    { metric: "Period Start", value: fmtDateOnly(reportData.periodStart) },
    { metric: "Period End", value: fmtDateOnly(reportData.periodEnd) },
    { metric: "Date Generated", value: fmtDate(new Date()) },
    { metric: "Total Components", value: reportData.currentInventory.length },
    { metric: "Total Units In Stock", value: totalStock },
    { metric: "Low Stock Components", value: reportData.lowStock.length },
    {
      metric: "Components Used In Period",
      value: reportData.componentsUsed.reduce((s, r) => s + Number(r.quantity), 0),
    },
    {
      metric: "Stock Received In Period",
      value: reportData.stockReceived.reduce((s, r) => s + Number(r.quantity), 0),
    },
    { metric: "Returns In Period", value: reportData.returns.length },
    { metric: "Replacements In Period", value: reportData.replacements.length },
  ]);

  const inventorySheet = workbook.addWorksheet("Current Inventory");
  inventorySheet.columns = [
    { header: "Component", key: "name", width: 30 },
    { header: "Model", key: "model", width: 25 },
    { header: "Stock", key: "stock", width: 12 },
    { header: "Min Quantity", key: "minQuantity", width: 14 },
    { header: "Damaged", key: "damaged", width: 12 },
  ];
  inventorySheet.addRows(reportData.currentInventory);

  const lowStockSheet = workbook.addWorksheet("Low Stock");
  lowStockSheet.columns = [
    { header: "Component", key: "name", width: 30 },
    { header: "Model", key: "model", width: 25 },
    { header: "Stock", key: "stock", width: 12 },
    { header: "Min Quantity", key: "minQuantity", width: 14 },
  ];
  lowStockSheet.addRows(reportData.lowStock);

  const usageSheet = workbook.addWorksheet("Components Used");
  usageSheet.columns = [
    { header: "Component", key: "productName", width: 25 },
    { header: "Quantity", key: "quantity", width: 12 },
    { header: "Issue Type", key: "issueType", width: 15 },
    { header: "Project/Device", key: "projectName", width: 25 },
    { header: "Employee(s)", key: "employeeNames", width: 25 },
    { header: "Date", key: "issueDate", width: 22 },
  ];
  usageSheet.addRows(
    reportData.componentsUsed.map((u) => ({ ...u, issueDate: fmtDate(u.issueDate) })),
  );

  const receivedSheet = workbook.addWorksheet("Stock Received");
  receivedSheet.columns = [
    { header: "Component", key: "productName", width: 25 },
    { header: "Quantity", key: "quantity", width: 12 },
    { header: "Supplier", key: "supplierName", width: 20 },
    { header: "Invoice #", key: "invoiceNumber", width: 18 },
    { header: "Received By", key: "receivedBy", width: 20 },
    { header: "Date", key: "receivedDate", width: 22 },
    { header: "Remarks", key: "remarks", width: 25 },
  ];
  receivedSheet.addRows(
    reportData.stockReceived.map((r) => ({ ...r, receivedDate: fmtDate(r.receivedDate) })),
  );

  const returnsSheet = workbook.addWorksheet("Returns");
  returnsSheet.columns = [
    { header: "Issue ID", key: "issueId", width: 12 },
    { header: "Issue Type", key: "issueType", width: 15 },
    { header: "Project/Workshop", key: "projectName", width: 25 },
    { header: "Employee(s)", key: "employeeNames", width: 25 },
    { header: "Returned Date", key: "returnedDate", width: 22 },
  ];
  returnsSheet.addRows(
    reportData.returns.map((r) => ({ ...r, returnedDate: fmtDate(r.returnedDate) })),
  );

  const replacementSheet = workbook.addWorksheet("Replacement History");
  replacementSheet.columns = [
    { header: "Old Component", key: "oldProductName", width: 25 },
    { header: "Old Serial #", key: "oldSerialNumber", width: 18 },
    { header: "New Component", key: "newProductName", width: 25 },
    { header: "New Serial #", key: "newSerialNumber", width: 18 },
    { header: "Employee", key: "employeeName", width: 20 },
    { header: "Reason", key: "reason", width: 25 },
    { header: "Installed By", key: "installedBy", width: 20 },
    { header: "Date", key: "requestDate", width: 22 },
  ];
  replacementSheet.addRows(
    reportData.replacements.map((r) => ({ ...r, requestDate: fmtDate(r.requestDate) })),
  );

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

module.exports = {
  generatePdfReport,
  generateExcelReport,
  buildFileName,
};
