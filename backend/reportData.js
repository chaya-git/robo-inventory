// reportData.js
//
// Shared data-access layer for the dashboard cards and the Daily/Weekly/
// Monthly/Custom reports (PDF + Excel). Keeping these queries in one place
// means the dashboard cards and the reports always agree with each other.

// Resolve a {start, end} Date range for a given period type.
// 'daily'  -> today
// 'weekly' -> the most recently completed Mon-Sun week (or current week to date)
// 'monthly'-> current calendar month to date
// 'custom' -> whatever start/end the caller supplies (ISO date strings)
function resolveRange(periodType, customStart, customEnd) {
  const now = new Date();
  let start, end;

  if (periodType === "custom") {
    start = customStart ? new Date(customStart) : new Date(now);
    end = customEnd ? new Date(customEnd) : new Date(now);
  } else if (periodType === "weekly") {
    end = new Date(now);
    start = new Date(now);
    start.setDate(start.getDate() - 7);
  } else if (periodType === "monthly") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now);
  } else {
    // daily (default)
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    end = new Date(now);
  }

  // Normalize to full-day boundaries so date-only comparisons work as expected
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

async function getCurrentInventory(pool) {
  const result = await pool.query(`
    SELECT
      product_id AS "productId",
      name,
      model,
      stock,
      damaged,
      original_stock AS "originalStock",
      min_quantity AS "minQuantity"
    FROM products
    ORDER BY name
  `);
  return result.rows;
}

async function getLowStock(pool) {
  const result = await pool.query(`
    SELECT
      product_id AS "productId",
      name,
      model,
      stock,
      min_quantity AS "minQuantity"
    FROM products
    WHERE stock <= min_quantity
    ORDER BY stock ASC
  `);
  return result.rows;
}

async function getComponentsUsed(pool, start, end) {
  const result = await pool.query(
    `
    SELECT
      ct.transaction_id AS "issueId",
      ct.purpose AS "issueType",
      ct.project_name AS "projectName",
      ct.customer_name AS "employeeNames",
      ct.issue_date AS "issueDate",
      ct.product_id AS "productId",
      p.name AS "productName",
      ct.quantity
    FROM customer_transactions ct
    JOIN products p ON p.product_id = ct.product_id
    WHERE ct.issue_date BETWEEN $1 AND $2
    ORDER BY ct.issue_date DESC
    `,
    [start, end],
  );
  return result.rows;
}

async function getStockReceived(pool, start, end) {
  const result = await pool.query(
    `
    SELECT
      sr.receipt_id AS "receiptId",
      p.name AS "productName",
      sr.quantity,
      COALESCE(s.name, sr.supplier_name) AS "supplierName",
      sr.invoice_number AS "invoiceNumber",
      sr.received_by AS "receivedBy",
      sr.received_date AS "receivedDate",
      sr.remarks
    FROM stock_received sr
    JOIN products p ON p.product_id = sr.product_id
    LEFT JOIN suppliers s ON s.supplier_id = sr.supplier_id
    WHERE sr.received_date BETWEEN $1 AND $2
    ORDER BY sr.received_date DESC
    `,
    [start, end],
  );
  return result.rows;
}

async function getReturns(pool, start, end) {
  const result = await pool.query(
    `
    SELECT
      ct.transaction_id AS "issueId",
      ct.purpose AS "issueType",
      ct.project_name AS "projectName",
      ct.customer_name AS "employeeNames",
      ct.return_date AS "returnedDate"
    FROM customer_transactions ct
    WHERE ct.status = 'Returned'
      AND ct.return_date BETWEEN $1 AND $2
    ORDER BY ct.return_date DESC
    `,
    [start, end],
  );
  return result.rows;
}

async function getReplacements(pool, start, end) {
  // The "exchange_requests" table (and the approval-based replacement
  // workflow it powered) was removed when the app switched to the direct
  // issue/return model. Replacements aren't a concept in that model, so
  // this always returns an empty list rather than querying a dropped table.
  return [];
}

async function getEmployeeActivity(pool, start, end) {
  // Rough activity roll-up per customer, used in the "Employee Activity"
  // section of reports. Replacements aren't tracked under the direct
  // issue/return model, so that bucket is always empty.
  const usage = await pool.query(
    `
    SELECT customer_name AS "employeeNames", COUNT(*) AS "issueCount"
    FROM customer_transactions
    WHERE issue_date BETWEEN $1 AND $2
    GROUP BY customer_name
    `,
    [start, end],
  );
  return { usage: usage.rows, replacements: [] };
}

async function getDashboardSummary(pool) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart);
  todayEnd.setHours(23, 59, 59, 999);

  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);

  const [
    totalsRes,
    lowStockRes,
    todayUsageRes,
    todayReceivedRes,
    weeklyUsageRes,
  ] = await Promise.all([
    pool.query(`SELECT COUNT(*) AS "totalComponents", COALESCE(SUM(stock),0) AS "availableInventory" FROM products`),
    pool.query(`SELECT COUNT(*) AS "lowStockCount" FROM products WHERE stock <= min_quantity`),
    pool.query(
      `
      SELECT COALESCE(SUM(quantity),0) AS "todayUsage"
      FROM customer_transactions
      WHERE issue_date BETWEEN $1 AND $2
      `,
      [todayStart, todayEnd],
    ),
    pool.query(
      `SELECT COALESCE(SUM(quantity),0) AS "todayReceived" FROM stock_received WHERE received_date BETWEEN $1 AND $2`,
      [todayStart, todayEnd],
    ),
    pool.query(
      `
      SELECT COALESCE(SUM(quantity),0) AS "weeklyUsage"
      FROM customer_transactions
      WHERE issue_date BETWEEN $1 AND $2
      `,
      [weekStart, now],
    ),
  ]);

  return {
    totalComponents: Number(totalsRes.rows[0].totalComponents),
    availableInventory: Number(totalsRes.rows[0].availableInventory),
    lowStock: Number(lowStockRes.rows[0].lowStockCount),
    todayUsage: Number(todayUsageRes.rows[0].todayUsage),
    todayStockReceived: Number(todayReceivedRes.rows[0].todayReceived),
    weeklyUsage: Number(weeklyUsageRes.rows[0].weeklyUsage),
    weeklyReplacement: 0,
  };
}

async function getFullReportData(pool, periodType, customStart, customEnd) {
  const { start, end } = resolveRange(periodType, customStart, customEnd);

  const [
    currentInventory,
    lowStock,
    componentsUsed,
    stockReceived,
    returns,
    replacements,
    employeeActivity,
  ] = await Promise.all([
    getCurrentInventory(pool),
    getLowStock(pool),
    getComponentsUsed(pool, start, end),
    getStockReceived(pool, start, end),
    getReturns(pool, start, end),
    getReplacements(pool, start, end),
    getEmployeeActivity(pool, start, end),
  ]);

  return {
    periodType,
    periodStart: start,
    periodEnd: end,
    currentInventory,
    lowStock,
    componentsUsed,
    stockReceived,
    returns,
    replacements,
    employeeActivity,
  };
}

module.exports = {
  resolveRange,
  getCurrentInventory,
  getLowStock,
  getComponentsUsed,
  getStockReceived,
  getReturns,
  getReplacements,
  getEmployeeActivity,
  getDashboardSummary,
  getFullReportData,
};
