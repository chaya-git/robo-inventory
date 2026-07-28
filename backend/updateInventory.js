const XLSX = require("xlsx");
const { Pool } = require("pg");

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "ProductManager",
  password: "Vatsalshlok@4321",
  port: 5432,
});

async function updateInventory() {
  const workbook = XLSX.readFile("inventory_spreadsheet.xlsx");

  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  const rows = XLSX.utils.sheet_to_json(sheet);

  for (const row of rows) {
    const name = String(row.Components || "").trim();

    if (!name) continue;

    const qty = parseInt(row.Qty) || 0;

    let stock = qty;
    let damaged = 0;
    let originalStock = qty;

    if (
      row.w !== undefined &&
      row.w !== null &&
      row.nw !== undefined &&
      row.nw !== null
    ) {
      stock = parseInt(row.w);
      damaged = parseInt(row.nw);
      originalStock = qty;
    }

    await pool.query(
      `
      UPDATE products
      SET
        stock = $1,
        damaged = $2,
        original_stock = $3
      WHERE LOWER(TRIM(name)) = LOWER(TRIM($4))
      `,
      [stock, damaged, originalStock, name]
    );

    console.log(
      `${name} -> stock=${stock}, damaged=${damaged}, original=${originalStock}`
    );
  }

  console.log("Inventory updated successfully.");

  await pool.end();
}

updateInventory();