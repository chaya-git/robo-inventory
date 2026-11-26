const express = require("express");
require("dotenv").config();

const { Pool } = require("pg");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;

const app = express();
const cors = require("cors");
const ExcelJS = require("exceljs");
const { logAudit } = require("./audit");
const reportData = require("./reportData");
const { generatePdfReport, generateExcelReport, buildFileName } = require("./reportGenerator");
const { startWeeklyReportCron, REPORTS_DIR } = require("./weeklyReportCron");
const fsForReports = require("fs");
const pathForReports = require("path");

app.use(express.json());
app.use(cors());

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: {
    rejectUnauthorized: false,
  },
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 20000,
  max: 10,
});

// Without this, an idle client that gets reset by Neon (e.g. after its
// compute auto-suspends and wakes back up) throws an unhandled 'error'
// event at the process level and can crash the whole server. Logging it
// here lets the pool quietly create a fresh connection on the next query
// instead of taking the app down.
pool.on("error", (err) => {
  console.error("Unexpected error on idle Postgres client", err.message);
});
const products = [
  {
    productId: 1,
    name: "ESP32 Development Board",
    model: "ESP32-WROOM-32",
    price: 449,
    stock: 25,
    damaged: 0,
    originalStock: 25,
    image:
      "https://probots.co.in/pub/media/catalog/product/cache/a75a14dfac7b8c850e5ffc2818097d60/e/s/esp32-wroom-32_chipset_module_4_mbit_flash_wifi_bluetooth_2_.jpg",
  },
  {
    productId: 2,
    name: "Arduino Board",
    model: "Leonardo R3 ATmega32u4",
    price: 849,
    stock: 12,
    damaged: 0,
    originalStock: 12,
    image:
      "https://robu.in/_next/image/?url=https%3A%2F%2Frobu-prod-media.s3.ap-south-1.amazonaws.com%2Fuploads%2F2015%2F01%2F39.jpg&w=1920&q=90",
  },
  {
    productId: 3,
    name: "Development Board",
    model: "YD-RP2040 Core Board",
    price: 235,
    stock: 18,
    damaged: 0,
    originalStock: 18,
    image:
      "https://probots.co.in/pub/media/catalog/product/cache/a75a14dfac7b8c850e5ffc2818097d60/y/d/yd-rp2040_16mb_development_board_hero_shot_yd-rp2040_type-c_port_detail_yd-rp2040_pinout_diagram_yd-rp2040_vs_raspberry_pi_pico_size_comparison_yd-rp2040_in_circuit_application_5__1.jpg",
  },
  {
    productId: 4,
    name: "Raspberry Pi Board",
    model: "Raspberry Pi Compute Module 5",
    price: 26499,
    stock: 5,
    damaged: 0,
    originalStock: 5,
    image:
      "https://probots.co.in/pub/media/catalog/product/cache/1d08c563198387b6f5b81ee1539a4df6/c/m/cm5_development_kit_-5.jpg",
  },
  {
    productId: 5,
    name: "PIR Motion Sensor",
    model: "HC-SR501",
    price: 120,
    stock: 30,
    damaged: 0,
    originalStock: 30,
    image:
      "https://imgs.search.brave.com/5D67GX9gpPmya1sbDAVYf7qXttootgouT0ZMSi2gpcU/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly9zbWFy/dHhwcm9raXRzLmlu/L3dwLWNvbnRlbnQv/dXBsb2Fkcy8yMDIy/LzAzL1VudGl0bGVk/LWRlc2lnbi0zOS5w/bmc",
  },
  {
    productId: 6,
    name: "Temperature Sensor",
    model: "DHT11",
    price: 150,
    stock: 20,
    damaged: 0,
    originalStock: 20,
    image:
      "https://imgs.search.brave.com/x9phF6u7k__LJxpJuwkI5KbUrA2yNU8a0Hu1CXYuvhI/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly9tLm1l/ZGlhLWFtYXpvbi5j/b20vaW1hZ2VzL0kv/NDE5QzM4MmZJcEwu/anBn",
  },
  {
    productId: 7,
    name: "Ultrasonic Sensor",
    model: "HC-SR04",
    price: 95,
    stock: 28,
    damaged: 0,
    originalStock: 28,
    image:
      "https://imgs.search.brave.com/2iorioeXd3RDLA8qH_5Rz1ovwdWxc0d1WuCiBNN5FPM/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly93d3cu/dGlueXRyb25pY3Mu/bmwvaW1hZ2UvY2Fj/aGUvY2F0YWxvZy9w/cm9kdWN0c18yMDIz/L3VsdHJhc29uaWMt/c2Vuc29yLWhjLXNy/MDQtZnJvbnQtNjAw/eDYwMC5qcGc",
  },
  {
    productId: 8,
    name: "Voltage Regulator",
    model: "LM7805 IC",
    price: 11,
    stock: 50,
    damaged: 0,
    originalStock: 50,
    image:
      "https://probots.co.in/pub/media/catalog/product/cache/a75a14dfac7b8c850e5ffc2818097d60/l/m/lm78055vregulator_lrg.jpg",
  },
  {
    productId: 9,
    name: "Power Supply Adapter",
    model: "12V 1A SMPS",
    price: 165,
    stock: 15,
    damaged: 0,
    originalStock: 15,
    image:
      "https://probots.co.in/pub/media/catalog/product/cache/a75a14dfac7b8c850e5ffc2818097d60/p/o/poweradapter_lrg.jpg",
  },
  {
    productId: 10,
    name: "Hookup Wire Set",
    model: "Multi-Stranded Wire Kit",
    price: 70,
    stock: 40,
    damaged: 0,
    originalStock: 40,
    image:
      "https://probots.co.in/pub/media/catalog/product/cache/a75a14dfac7b8c850e5ffc2818097d60/p/r/pro086_1.jpg",
  },
  {
    productId: 11,
    name: "Piezo Buzzer",
    model: "B-27 Industrial",
    price: 49,
    stock: 35,
    damaged: 0,
    originalStock: 35,
    image:
      "https://probots.co.in/pub/media/catalog/product/cache/a75a14dfac7b8c850e5ffc2818097d60/p/i/piezo_electric_buzzer_alarm_3v-24v_continuous_sound_b-27_industrial_grade_2.jpg",
  },
  {
    productId: 12,
    name: "Digital Multimeter",
    model: "DT830D",
    price: 235,
    stock: 8,
    damaged: 0,
    originalStock: 8,
    image:
      "https://probots.co.in/pub/media/catalog/product/cache/a75a14dfac7b8c850e5ffc2818097d60/m/u/multimeterdt830d_lrg.jpg",
  },
  {
    productId: 13,
    name: "FPGA Board",
    model: "Tang Mega 138K Dock",
    price: 26499,
    stock: 4,
    damaged: 0,
    originalStock: 4,
    image:
      "https://probots.co.in/pub/media/catalog/product/cache/a75a14dfac7b8c850e5ffc2818097d60/t/a/tang_mega_138k_dock_5.jpg",
  },
  {
    productId: 14,
    name: "Bluetooth Module",
    model: "HC-05",
    price: 320,
    stock: 18,
    damaged: 0,
    originalStock: 18,
    image:
      "https://imgs.search.brave.com/wytrT9dThlYyKc7TvhH8LPWYLMhd13rzpAwnScM-IDU/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly93d3cu/a3Ryb24uaW4vd3At/Y29udGVudC91cGxv/YWRzLzIwMjAvMDIv/a3N0bTAwNjUtYmx1/ZXRvb3RoLW1vZHVs/ZS1oYy0wNS00LTYw/MHg2MDAuanBn",
  },
  {
    productId: 15,
    name: "PCB Board",
    model: "FR4 Double Layer",
    price: 80,
    stock: 50,
    damaged: 0,
    originalStock: 50,
    image:
      "https://imgs.search.brave.com/MNCjSRmIo0wr90gTMwOimnTPfVRBTmdANsDhcqPX3F0/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly9tLm1l/ZGlhLWFtYXpvbi5j/b20vaW1hZ2VzL0kv/NzE5TkIzbzZqQ0wu/anBn",
  },
];

// let issuedProjects = [];
// let issuedWorkshops = [];
app.get("/dbcheck", async (req, res) => {
  const result = await pool.query(`
    SELECT
      current_database(),
      current_user,
      current_schema(),
      current_setting('search_path');
  `);

  res.json(result.rows[0]);
});
app.get("/projects", async (req, res) => {
  try {
    // if an Authorization header is present and the user is not admin, filter by issued_by
    let auth = req.headers["authorization"];
    if (auth) {
      try {
        const token = auth.split(" ")[1];
        const payload = jwt.verify(token, JWT_SECRET);
        if (String(payload.role).toLowerCase() !== "admin") {
          const q = await pool.query(
            `SELECT issue_id AS "issueId", issue_type AS "issueType", project_name AS "projectName", venue, issue_date AS "date", employee_ids AS "employeeIds", employee_names AS "employeeNames", status FROM issues WHERE issue_type='Project' AND issued_by = $1`,
            [payload.email],
          );
          return res.json(q.rows);
        }
      } catch (e) {
        // ignore and fallthrough to admin view
      }
    }
    const result = await pool.query(
      `SELECT issue_id AS "issueId", issue_type AS "issueType", project_name AS "projectName", venue, issue_date AS "date", employee_ids AS "employeeIds", employee_names AS "employeeNames", status FROM issues WHERE issue_type='Project'`,
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error in /projects", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.get("/workshops", async (req, res) => {
  try {
    let auth = req.headers["authorization"];
    if (auth) {
      try {
        const token = auth.split(" ")[1];
        const payload = jwt.verify(token, JWT_SECRET);
        if (String(payload.role).toLowerCase() !== "admin") {
          const q = await pool.query(
            `SELECT issue_id AS "issueId", issue_type AS "issueType", project_name AS "projectName", venue, issue_date AS "date", employee_ids AS "employeeIds", employee_names AS "employeeNames", status FROM issues WHERE issue_type='Workshop' AND issued_by = $1`,
            [payload.email],
          );
          return res.json(q.rows);
        }
      } catch (e) {}
    }
    const result = await pool.query(
      `SELECT issue_id AS "issueId", issue_type AS "issueType", project_name AS "projectName", venue, issue_date AS "date", employee_ids AS "employeeIds", employee_names AS "employeeNames", status FROM issues WHERE issue_type='Workshop'`,
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error in /workshops", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.get("/testing", async (req, res) => {
  try {
    let auth = req.headers["authorization"];
    if (auth) {
      try {
        const token = auth.split(" ")[1];
        const payload = jwt.verify(token, JWT_SECRET);
        if (String(payload.role).toLowerCase() !== "admin") {
          const q = await pool.query(
            `SELECT issue_id AS "issueId", issue_type AS "issueType", project_name AS "projectName", venue, issue_date AS "date", employee_ids AS "employeeIds", employee_names AS "employeeNames", status,expected_return_date AS "expectedReturnDate" FROM issues WHERE issue_type='Testing' AND issued_by = $1`,
            [payload.email],
          );
          return res.json(q.rows);
        }
      } catch (e) {}
    }
    const result = await pool.query(
      `SELECT issue_id AS "issueId", issue_type AS "issueType", project_name AS "projectName", venue, issue_date AS "date", employee_ids AS "employeeIds", employee_names AS "employeeNames", status,expected_return_date AS "expectedReturnDate" FROM issues WHERE issue_type='Testing'`,
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error in /testing", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.post("/issue", async (req, res) => {
  let issueData = req.body;
  console.log(issueData);
  let expectedReturnDate = null;

  if (issueData.issueType === "Testing") {
    expectedReturnDate = new Date(issueData.date);

    expectedReturnDate.setDate(
      expectedReturnDate.getDate() + Number(issueData.testingDuration),
    );
  }
  issueData.issueId = Date.now();

  for (let component of issueData.components) {
    let product = products.find((p) => p.productId === component.productId);

    if (!product) {
      return res.json({
        success: false,
        message: "Product not found",
      });
    }

    if (component.quantity > product.stock) {
      return res.json({
        success: false,
        message: `${product.name} has insufficient stock`,
      });
    }
  }

  for (let component of issueData.components) {
    await pool.query(
      `
      UPDATE products
      SET stock = stock - $1
      WHERE product_id = $2
      `,
      [component.quantity, component.productId],
    );
  }

  // ensure issued_by column exists
  try {
    await pool.query(
      `ALTER TABLE issues ADD COLUMN IF NOT EXISTS issued_by VARCHAR(255)`,
    );
  } catch (e) {
    /* ignore */
  }

  await pool.query(
    `
      INSERT INTO issues
      (
      issue_id,
      issue_type,
      project_name,
      venue,
      issue_date,
      employee_ids,
      employee_names,
      status,
      expected_return_date
      )

      VALUES
      (
      $1,$2,$3,$4,$5,$6,$7,$8,$9
      )
      `,
    [
      issueData.issueId,
      issueData.issueType,
      issueData.projectName,
      issueData.venue,
      issueData.date,
      issueData.employees.join(","),
      issueData.names.join(","),
      issueData.status,
      expectedReturnDate,
    ],
  );
  for (let component of issueData.components) {
    await pool.query(
      `
      INSERT INTO issue_components
      (
      issue_id,
      product_id,
      quantity
      )

      VALUES
      (
      $1,$2,$3
      )
      `,
      [issueData.issueId, component.productId, component.quantity],
    );
  }

  for (let component of issueData.components) {
    const product = products.find((p) => p.productId === component.productId);
    await logAudit(pool, {
      actorEmail: issueData.issuedBy || (issueData.names || [])[0] || null,
      actorRole: "employee",
      action: "COMPONENT_USED",
      description: `${(issueData.names || []).join(", ") || "Someone"} used ${component.quantity} ${product ? product.name : "component #" + component.productId} (${issueData.issueType}${issueData.projectName ? " - " + issueData.projectName : ""})`,
      metadata: { issueId: issueData.issueId, productId: component.productId, quantity: component.quantity },
    });
  }

  res.json({
    success: true,
    message: "Issued Successfully",
  });
});

app.post("/returnProject", async (req, res) => {
  let issueId = req.body.issueId;

  const issue = await pool.query(
    `
    SELECT *
    FROM issues
    WHERE issue_id = $1
    `,
    [issueId],
  );

  if (issue.rows.length === 0) {
    return res.json({
      success: false,
      message: "Project not found",
    });
  }

  if (issue.rows[0].status === "Returned") {
    return res.json({
      success: false,
      message: "Already Returned",
    });
  }

  const components = await pool.query(
    `
    SELECT *
    FROM issue_components
    WHERE issue_id = $1
    `,
    [issueId],
  );

  for (let component of components.rows) {
    await pool.query(
      `
      UPDATE products
      SET stock = stock + $1
      WHERE product_id = $2
      `,
      [component.quantity, component.product_id],
    );
  }

  await pool.query(
    `
    UPDATE issues
    SET status = 'Returned'
    WHERE issue_id = $1
    `,
    [issueId],
  );

  res.json({
    success: true,
    message: "Project Components Returned",
  });
});

app.post("/returnWorkshop", async (req, res) => {
  // Deprecated - use /returnIssue with damage details
  res.json({
    success: false,
    message: "Use /returnIssue with damaged details",
  });
});

// New unified return endpoint: handles Workshop and Testing returns with damaged quantities
app.post("/returnIssue", async (req, res) => {
  try {
    const { issueId, damaged } = req.body; // damaged: [{ productId, damagedQty }]
    console.log("POST /returnIssue called", { issueId, damaged });

    // fetch issue
    const issueRes = await pool.query(
      `SELECT * FROM issues WHERE issue_id = $1`,
      [issueId],
    );
    if (issueRes.rows.length === 0) {
      return res.json({ success: false, message: "Issue not found" });
    }
    const issue = issueRes.rows[0];
    if (!(issue.issue_type === "Workshop" || issue.issue_type === "Testing")) {
      return res.json({
        success: false,
        message: "Only Workshop and Testing issues can be returned",
      });
    }
    if (issue.status === "Returned") {
      return res.json({ success: false, message: "Already Returned" });
    }

    // fetch issued components
    const compsRes = await pool.query(
      `SELECT * FROM issue_components WHERE issue_id = $1`,
      [issueId],
    );
    const issuedComponents = compsRes.rows; // array of { issue_id, product_id, quantity }

    // validate damaged list
    const damagedMap = {};
    if (Array.isArray(damaged)) {
      for (let d of damaged) {
        console.log("damaged item received:", d);
        damagedMap[d.productId] = Number(d.damagedQty) || 0;
      }
    }

    console.log("damagedMap computed:", damagedMap);

    // validate damaged quantities first
    for (let comp of issuedComponents) {
      const issuedQty = Number(comp.quantity);
      const pid = comp.product_id;
      const damagedQty = Number(damagedMap[pid]) || 0;
      if (damagedQty < 0 || damagedQty > issuedQty) {
        return res.json({
          success: false,
          message: `Invalid damaged quantity for product ${pid}`,
        });
      }
    }

    // Begin transaction to ensure atomic updates
    const client = await pool.connect();
    try {
      // Ensure damaged column exists (in case migration wasn't run)
      const colRes = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name='products' AND column_name='damaged'
      `);
      if (colRes.rows.length === 0) {
        console.log("Adding missing column products.damaged");
        await client.query(
          `ALTER TABLE products ADD COLUMN damaged INTEGER DEFAULT 0`,
        );
      }

      // Ensure damaged_components table exists and has required columns
      await client.query(`
        CREATE TABLE IF NOT EXISTS damaged_components (
          id SERIAL PRIMARY KEY,
          issue_id BIGINT,
          product_id INTEGER NOT NULL,
          damaged_quantity INTEGER NOT NULL,
          quantity_issued INTEGER,
          issue_type VARCHAR(50),
          project_name VARCHAR(255),
          return_date TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
        )
      `);

      // Ensure quantity_issued column exists (in case older installation lacks it)
      const qc = await client.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name='damaged_components' AND column_name='quantity_issued'`,
      );
      if (qc.rows.length === 0) {
        await client.query(
          `ALTER TABLE damaged_components ADD COLUMN quantity_issued INTEGER`,
        );
      }

      await client.query("BEGIN");

      const updateResults = [];
      for (let comp of issuedComponents) {
        const issuedQty = Number(comp.quantity);
        const pid = comp.product_id;
        const damagedQty = Number(damagedMap[pid]) || 0;
        const returnedQty = issuedQty - damagedQty;

        console.log(
          `Returning for issue ${issueId} product ${pid}: issued=${issuedQty}, damaged=${damagedQty}, returned=${returnedQty}`,
        );

        // update products: stock += returnedQty, damaged += damagedQty
        await client.query(
          `UPDATE products SET stock = stock + $1, damaged = COALESCE(damaged,0) + $2 WHERE product_id = $3`,
          [returnedQty, damagedQty, pid],
        );

        // fetch updated product values for verification
        const newVals = await client.query(
          `SELECT product_id, stock, damaged FROM products WHERE product_id = $1`,
          [pid],
        );
        const current = newVals.rows[0] || {
          product_id: pid,
          stock: null,
          damaged: null,
        };

        // record damaged if any
        if (damagedQty > 0) {
          await client.query(
            `INSERT INTO damaged_components (issue_id, product_id, damaged_quantity, quantity_issued, issue_type, project_name, return_date) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [
              issueId,
              pid,
              damagedQty,
              issuedQty,
              issue.issue_type,
              issue.project_name,
              new Date(),
            ],
          );
        }

        updateResults.push({
          productId: pid,
          issuedQty,
          damagedQty,
          returnedQty,
          currentStock: current.stock,
          currentDamaged: current.damaged,
        });
      }

      // mark issue as returned
      await client.query(
        `UPDATE issues SET status = 'Returned', returned_date = NOW() WHERE issue_id = $1`,
        [issueId],
      );

      await client.query("COMMIT");

      for (const u of updateResults) {
        await logAudit(pool, {
          actorRole: "employee",
          action: "COMPONENT_RETURNED",
          description: `Issue #${issueId}: returned ${u.returnedQty} of product #${u.productId}${u.damagedQty > 0 ? ` (${u.damagedQty} marked damaged)` : ""}`,
          metadata: { issueId, ...u },
        });
      }

      res.json({
        success: true,
        message: "Return processed successfully",
        details: updateResults,
      });
    } catch (txErr) {
      await client.query("ROLLBACK");
      console.error("Transaction error in /returnIssue:", txErr);
      res.json({
        success: false,
        message: "Server error during return (transaction rolled back)",
      });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: "Server error" });
  }
});

app.post("/markDamaged", async (req, res) => {
  let id = req.body.id;
  let qty = req.body.qty;

  const result = await pool.query(
    `
    SELECT stock
    FROM products
    WHERE product_id = $1
    `,
    [id],
  );

  if (result.rows.length === 0) {
    return res.json({
      success: false,
      message: "Product not found",
    });
  }

  let stock = result.rows[0].stock;

  if (qty <= 0 || qty > stock) {
    return res.json({
      success: false,
      message: "Invalid quantity",
    });
  }

  // Ensure products.damaged column exists
  const colRes = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name='products' AND column_name='damaged'
  `);
  if (colRes.rows.length === 0) {
    await pool.query(
      `ALTER TABLE products ADD COLUMN damaged INTEGER DEFAULT 0`,
    );
  }

  // Subtract stock and increment damaged (use COALESCE to handle NULL)
  await pool.query(
    `
    UPDATE products
    SET
      stock = stock - $1,
      damaged = COALESCE(damaged,0) + $1
    WHERE product_id = $2
    `,
    [qty, id],
  );

  // Ensure damaged_components table exists and insert a manual damage record
  await pool.query(`
    CREATE TABLE IF NOT EXISTS damaged_components (
      id SERIAL PRIMARY KEY,
      issue_id BIGINT,
      product_id INTEGER NOT NULL,
      damaged_quantity INTEGER NOT NULL,
      quantity_issued INTEGER,
      issue_type VARCHAR(50),
      project_name VARCHAR(255),
      return_date TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
    )
  `);

  // Get product name for clearer manual record (falls back to 'Manual')
  const prodRes = await pool.query(
    `SELECT name FROM products WHERE product_id=$1`,
    [id],
  );
  const prodName =
    prodRes.rows[0] && prodRes.rows[0].name ? prodRes.rows[0].name : "Manual";

  await pool.query(
    `INSERT INTO damaged_components (issue_id, product_id, damaged_quantity, quantity_issued, issue_type, project_name, return_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [null, id, qty, null, "Manual", prodName, new Date()],
  );

  await logAudit(pool, {
    action: "COMPONENT_DAMAGED",
    description: `${qty} ${prodName} marked as damaged`,
    metadata: { productId: id, quantity: qty },
  });

  res.json({
    success: true,
    message: "Damage updated",
  });
});

app.get("/", (req, res) => {
  res.send("Backend Running");
});

app.get("/products", async (req, res) => {
  try {
    const result = await pool.query(
      `
SELECT
  product_id AS "productId",
  name,
  model,
  price,
  stock,
  damaged,
  original_stock AS "originalStock",
  image,
  rack_number AS "rackNumber",
  description
FROM products
`,
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Error in GET /products:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Damaged products summary
app.get("/damagedProducts", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        p.product_id AS "productId",
        p.name,
        p.image,
        COALESCE(SUM(dc.damaged_quantity),0) AS total_damaged,
        COALESCE(SUM(CASE WHEN dc.issue_type='Workshop' THEN dc.damaged_quantity END),0) AS damaged_workshop,
        COALESCE(SUM(CASE WHEN dc.issue_type='Testing' THEN dc.damaged_quantity END),0) AS damaged_testing,
        COALESCE(SUM(CASE WHEN dc.issue_type='Project' THEN dc.damaged_quantity END),0) AS damaged_project,
        COALESCE(SUM(CASE WHEN dc.issue_type='Manual' THEN dc.damaged_quantity END),0) AS damaged_manual
      FROM products p
      LEFT JOIN damaged_components dc ON p.product_id = dc.product_id
      GROUP BY p.product_id, p.name, p.image
      HAVING COALESCE(SUM(dc.damaged_quantity),0) > 0
      ORDER BY total_damaged DESC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching damagedProducts", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.get("/damagedProducts/monthly", async (req, res) => {
  try {
    const month = req.query.month;

    const result = await pool.query(
      `
          SELECT
            p.name,
            SUM(dc.damaged_quantity)
              AS damaged_count
          FROM damaged_components dc
          JOIN products p
            ON p.product_id =
               dc.product_id
          WHERE
            TO_CHAR(
              dc.return_date,
              'YYYY-MM'
            ) = $1
          GROUP BY
            p.name
          ORDER BY
            damaged_count DESC
          `,
      [month],
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
});

app.get("/damagedProducts/export", async (req, res) => {
  try {
    const month = req.query.month;

    const result = await pool.query(
      `
  SELECT
    p.name,

    SUM(dc.damaged_quantity)
      AS total_damaged,

    SUM(
      CASE
        WHEN dc.issue_type='Workshop'
        THEN dc.damaged_quantity
        ELSE 0
      END
    ) AS damaged_workshop,

    SUM(
      CASE
        WHEN dc.issue_type='Testing'
        THEN dc.damaged_quantity
        ELSE 0
      END
    ) AS damaged_testing,

    SUM(
      CASE
        WHEN dc.issue_type='Project'
        THEN dc.damaged_quantity
        ELSE 0
      END
    ) AS damaged_project

  FROM damaged_components dc

  JOIN products p
    ON p.product_id =
       dc.product_id

  WHERE
    TO_CHAR(
      dc.return_date,
      'YYYY-MM'
    ) = $1

  GROUP BY
    p.name

  ORDER BY
    total_damaged DESC
  `,
      [month],
    );

    const workbook = new ExcelJS.Workbook();

    const sheet = workbook.addWorksheet("Damaged Report");

    sheet.columns = [
      {
        header: "Product Name",
        key: "name",
        width: 35,
      },

      {
        header: "Total Damaged",
        key: "total_damaged",
        width: 18,
      },

      {
        header: "Workshop Damage",
        key: "damaged_workshop",
        width: 18,
      },

      {
        header: "Testing Damage",
        key: "damaged_testing",
        width: 18,
      },

      {
        header: "Project Damage",
        key: "damaged_project",
        width: 18,
      },
    ];

    sheet.getRow(1).font = {
      bold: true,
    };

    sheet.getRow(1).alignment = {
      horizontal: "center",
    };

    result.rows.forEach((row) => {
      sheet.addRow(row);
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=Damaged_Report_${month}.xlsx`,
    );

    await workbook.xlsx.write(res);

    res.end();
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
});

// Damaged product details
app.get("/damagedProducts/:productId/details", async (req, res) => {
  const productId = Number(req.params.productId);
  try {
    const result = await pool.query(
      `SELECT
         issue_id AS issueId,
         issue_type AS issueType,
         COALESCE(project_name, issue_type, 'Unknown') AS issueName,
         COALESCE(quantity_issued, 0) AS quantityIssued,
         COALESCE(damaged_quantity, 0) AS damagedQty,
         return_date AS returnDate
       FROM damaged_components
       WHERE product_id = $1
       ORDER BY return_date DESC`,
      [productId],
    );

    console.log(
      `/damagedProducts/${productId}/details -> returned ${result.rows.length} rows`,
    );
    // Normalize damagedQty to number on the server side to avoid frontend type issues
    const normalized = result.rows.map((r) => ({
      issueId: r.issueid || r.issueId,
      issueType: r.issuetype || r.issueType,
      issueName: r.issuename || r.issueName,
      quantityIssued: Number(r.quantityissued || r.quantityIssued || 0),
      damagedQty: Number(r.damagedqty || r.damagedQty || 0),
      returnDate: r.returndate || r.returnDate,
    }));

    res.json(normalized);
  } catch (err) {
    console.error("Error fetching damaged product details", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Direct customer signup: no approval step, logs the customer in immediately.
app.post("/customerSignup", async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) {
      return res.json({ success: false, message: "Missing fields" });
    }

    const existing = await pool.query(`SELECT id FROM users WHERE email = $1`, [
      email,
    ]);
    if (existing.rows.length > 0) {
      return res.json({ success: false, message: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const inserted = await pool.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,'customer') RETURNING id, name, email, role`,
      [name, email, passwordHash],
    );
    const user = inserted.rows[0];
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "8h" },
    );
    res.json({ success: true, role: user.role, token });
  } catch (err) {
    console.error("Error in POST /customerSignup", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.post("/login", (req, res) => {
  (async () => {
    try {
      const { email, password } = req.body || {};
      // If email provided, attempt to authenticate against users table
      if (email) {
        // ensure users table exists
        const usersExist = await pool.query(
          `SELECT to_regclass('public.users') as t`,
        );
        if (!usersExist.rows[0].t) {
          return res.json({
            success: false,
            message: "No users available",
            role: "customer",
          });
        }
        const u = await pool.query(`SELECT * FROM users WHERE email = $1`, [
          email,
        ]);
        if (u.rows.length === 0)
          return res.json({ success: false, message: "Invalid credentials" });
        const user = u.rows[0];
        const match = await bcrypt.compare(password || "", user.password_hash);
        if (!match)
          return res.json({ success: false, message: "Invalid credentials" });
        const role = user.role || "customer";
        const token = jwt.sign(
          { id: user.id, email: user.email, role },
          JWT_SECRET,
          { expiresIn: "8h" },
        );
        return res.json({ success: true, role, token });
      }

      // Fallback: admin password check (legacy)
      const passwordOnly = req.body.password;
      if (passwordOnly === process.env.ADMIN_PASSWORD) {
        // legacy admin login - issue a token with admin role
        const token = jwt.sign(
          { id: null, email: null, role: "admin" },
          JWT_SECRET,
          { expiresIn: "8h" },
        );
        return res.json({ success: true, role: "admin", token });
      } else {
        return res.json({
          success: false,
          message: "Wrong Password",
          role: "customer",
        });
      }
    } catch (err) {
      console.error("Error in /login", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  })();
});

// auth middleware
function authenticateToken(req, res, next) {
  const auth = req.headers["authorization"];
  if (!auth)
    return res.status(401).json({ success: false, message: "Missing token" });
  const parts = auth.split(" ");
  if (parts.length !== 2)
    return res
      .status(401)
      .json({ success: false, message: "Invalid token format" });
  const token = parts[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user)
    return res
      .status(401)
      .json({ success: false, message: "Not authenticated" });
  if (String(req.user.role).toLowerCase() !== "admin")
    return res.status(403).json({ success: false, message: "Admin required" });
  next();
}

app.get("/me", authenticateToken, async (req, res) => {
  // return basic user info from token
  res.json({ success: true, user: req.user });
});

app.post("/addProduct", async (req, res) => {
  let { name, model, price, stock, image, rackNumber, description } = req.body;

  const maxId = await pool.query(
    `
    SELECT MAX(product_id) AS maxid
    FROM products
    `,
  );

  let newId = (maxId.rows[0].maxid || 0) + 1;

  await pool.query(
    `
    INSERT INTO products
    (
      product_id,
      name,
      model,
      price,
      stock,
      damaged,
      original_stock,
      image,
      rack_number,
      description
    )

    VALUES
    (
      $1,$2,$3,$4,$5,0,$5,$6,$7,$8
    )
    `,
    [newId, name, model, price, stock, image, rackNumber || null, description || null],
  );

  res.json({
    success: true,
    message: "Product Added Successfully",
  });
});

// Edit an existing product (Inventory Management "Edit")
app.put("/products/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const productId = Number(req.params.id);
    const { name, model, price, stock, image, rackNumber, description } = req.body || {};

    const existing = await pool.query(
      `SELECT product_id FROM products WHERE product_id = $1`,
      [productId],
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    await pool.query(
      `
      UPDATE products
      SET
        name = COALESCE($1, name),
        model = COALESCE($2, model),
        price = COALESCE($3, price),
        stock = COALESCE($4, stock),
        image = COALESCE($5, image),
        rack_number = COALESCE($6, rack_number),
        description = COALESCE($7, description)
      WHERE product_id = $8
      `,
      [
        name ?? null,
        model ?? null,
        price ?? null,
        stock ?? null,
        image ?? null,
        rackNumber ?? null,
        description ?? null,
        productId,
      ],
    );

    await logAudit(pool, {
      actorEmail: req.user ? req.user.email : null,
      actorRole: req.user ? req.user.role : null,
      action: "PRODUCT_UPDATED",
      description: `Updated product #${productId}`,
      metadata: { productId, name, model, price, stock, rackNumber },
    });

    res.json({ success: true, message: "Product updated successfully" });
  } catch (err) {
    console.error("Error in PUT /products/:id", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Delete a product (Inventory Management "Delete")
app.delete("/products/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const productId = Number(req.params.id);
    const result = await pool.query(
      `DELETE FROM products WHERE product_id = $1 RETURNING product_id, name`,
      [productId],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    await logAudit(pool, {
      actorEmail: req.user ? req.user.email : null,
      actorRole: req.user ? req.user.role : null,
      action: "PRODUCT_DELETED",
      description: `Deleted product ${result.rows[0].name} (#${productId})`,
      metadata: { productId },
    });

    res.json({ success: true, message: "Product deleted successfully" });
  } catch (err) {
    console.error("Error in DELETE /products/:id", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ---------- Direct issue/return workflow (customer-facing) ----------

// Customer-facing components list
app.get("/components", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        product_id AS "productId",
        name,
        description,
        image,
        stock,
        rack_number AS "rackNumber"
      FROM products
      ORDER BY name
      `,
    );
    res.json({ success: true, components: result.rows });
  } catch (err) {
    console.error("Error in GET /components", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Customer takes a component directly - no approval step
app.post("/components/:id/take", authenticateToken, async (req, res) => {
  const productId = Number(req.params.id);
  const { name, projectName, purpose, quantity } = req.body || {};

  const qty = Number(quantity);
  if (!name || !String(name).trim()) {
    return res.status(400).json({ success: false, message: "Name is required." });
  }
  if (!projectName || !String(projectName).trim()) {
    return res.status(400).json({ success: false, message: "Project name is required." });
  }
  if (!purpose || !String(purpose).trim()) {
    return res.status(400).json({ success: false, message: "Purpose is required." });
  }
  if (!Number.isInteger(qty) || qty <= 0) {
    return res.status(400).json({ success: false, message: "Quantity must be a positive whole number." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const prodRes = await client.query(
      `SELECT product_id, name, stock, rack_number FROM products WHERE product_id = $1 FOR UPDATE`,
      [productId],
    );
    if (prodRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Component not found." });
    }
    const product = prodRes.rows[0];
    if (Number(product.stock) < qty) {
      await client.query("ROLLBACK");
      return res.status(400).json({ success: false, message: "Not enough stock available." });
    }

    await client.query(
      `UPDATE products SET stock = stock - $1 WHERE product_id = $2`,
      [qty, productId],
    );

    const inserted = await client.query(
      `
      INSERT INTO customer_transactions
        (customer_id, customer_name, product_id, quantity, project_name, purpose, rack_number, issue_date, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),'Issued')
      RETURNING transaction_id AS "transactionId"
      `,
      [req.user.id, name, productId, qty, projectName, purpose, product.rack_number],
    );

    await client.query("COMMIT");

    await logAudit(pool, {
      actorEmail: req.user.email,
      actorRole: req.user.role,
      action: "COMPONENT_TAKEN",
      description: `${name} took ${qty} ${product.name} for ${projectName}`,
      metadata: { productId, quantity: qty, projectName, purpose },
    });

    res.json({
      success: true,
      message: "Component taken successfully",
      transactionId: inserted.rows[0].transactionId,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error in POST /components/:id/take", err);
    res.status(500).json({ success: false, message: "Server error" });
  } finally {
    client.release();
  }
});

// Customer's own transaction history
app.get("/myTransactions", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        ct.transaction_id AS "transactionId",
        p.name AS "componentName",
        ct.product_id AS "productId",
        ct.quantity,
        ct.project_name AS "projectName",
        ct.purpose,
        ct.rack_number AS "rackNumber",
        ct.issue_date AS "issueDate",
        ct.return_date AS "returnDate",
        ct.status
      FROM customer_transactions ct
      JOIN products p ON p.product_id = ct.product_id
      WHERE ct.customer_id = $1
      ORDER BY ct.issue_date DESC
      `,
      [req.user.id],
    );
    res.json({ success: true, transactions: result.rows });
  } catch (err) {
    console.error("Error in GET /myTransactions", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// =====================================================================
// OTP store for return verification (in-memory, expires in 5 minutes)
// =====================================================================
const crypto = require("crypto");
const otpStore = new Map(); // key: transactionId, value: { otp, expiresAt, userId }

// Helper: send OTP via email (Brevo SMTP - free 300 emails/day, works from cloud servers)
async function sendOtpEmail(otp) {
  const nodemailer = require("nodemailer");

  const SMTP_USER = process.env.OTP_SMTP_USER || process.env.OTP_GMAIL_USER;
  const SMTP_PASS = process.env.OTP_SMTP_PASS || process.env.OTP_GMAIL_PASS;
  const ADMIN_EMAIL = process.env.OTP_ADMIN_EMAIL || "chayas008@gmail.com";
  const FROM_EMAIL = process.env.OTP_FROM_EMAIL || ADMIN_EMAIL;
  const SMTP_HOST = process.env.OTP_SMTP_HOST || "smtp-relay.brevo.com";
  const SMTP_PORT = Number(process.env.OTP_SMTP_PORT) || 587;

  // Always log OTP to Render console as a fallback
  console.log(`\n========================================`);
  console.log(`[OTP] Code: ${otp} | To: ${ADMIN_EMAIL}`);
  console.log(`========================================\n`);

  if (!SMTP_USER || !SMTP_PASS) {
    console.warn("[OTP] SMTP credentials not set – OTP printed to logs only.");
    return { success: true, dev: true };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: false,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: `"RoboManthan Inventory" <${FROM_EMAIL}>`,
      to: ADMIN_EMAIL,
      subject: `Return OTP: ${otp}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:400px;margin:auto;border:1px solid #eee;border-radius:10px;padding:24px">
          <h2 style="color:#131921;margin-bottom:4px">RoboManthan Inventory</h2>
          <p style="color:#555;margin-top:0">Component Return Verification</p>
          <hr style="border:none;border-top:1px solid #eee"/>
          <p style="font-size:15px">Your OTP for returning a component is:</p>
          <div style="background:#f7f7f7;border-radius:8px;padding:16px 24px;text-align:center;margin:16px 0">
            <span style="font-size:36px;font-weight:bold;letter-spacing:10px;color:#ff9900">${otp}</span>
          </div>
          <p style="color:#888;font-size:13px">This OTP is valid for <b>5 minutes</b>. Do not share it.</p>
        </div>
      `,
    });

    console.log(`[OTP] Email sent successfully to ${ADMIN_EMAIL}`);
    return { success: true };
  } catch (err) {
    console.error("[OTP] Email send failed:", err.message);
    return { success: false, error: err.message };
  }
}

// Step 1: Request OTP for return
app.post("/transactions/:id/return/request-otp", authenticateToken, async (req, res) => {
  const transactionId = Number(req.params.id);
  try {
    const txRes = await pool.query(
      `SELECT * FROM customer_transactions WHERE transaction_id = $1`,
      [transactionId],
    );
    if (txRes.rows.length === 0)
      return res.status(404).json({ success: false, message: "Transaction not found." });
    const tx = txRes.rows[0];
    if (tx.customer_id !== req.user.id)
      return res.status(403).json({ success: false, message: "This transaction doesn't belong to you." });
    if (tx.status !== "Issued")
      return res.status(400).json({ success: false, message: "This component has already been returned." });

    // Generate 6-digit OTP
    const otp = String(Math.floor(100000 + crypto.randomInt(900000)));
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
    otpStore.set(transactionId, { otp, expiresAt, userId: req.user.id });

    // Send OTP via Gmail email
    const smsResult = await sendOtpEmail(otp);
    console.log("OTP send result:", JSON.stringify(smsResult));

    res.json({ success: true, message: "OTP sent to the registered email address (chayas008@gmail.com). Valid for 5 minutes." });
  } catch (err) {
    console.error("Error in /transactions/:id/return/request-otp", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Step 2: Verify OTP and process return
app.post("/transactions/:id/return/verify-otp", authenticateToken, async (req, res) => {
  const transactionId = Number(req.params.id);
  const { otp } = req.body || {};

  if (!otp) return res.status(400).json({ success: false, message: "OTP is required." });

  const record = otpStore.get(transactionId);
  if (!record)
    return res.status(400).json({ success: false, message: "No OTP requested for this transaction. Please request an OTP first." });
  if (record.userId !== req.user.id)
    return res.status(403).json({ success: false, message: "Unauthorised." });
  if (Date.now() > record.expiresAt) {
    otpStore.delete(transactionId);
    return res.status(400).json({ success: false, message: "OTP has expired. Please request a new one." });
  }
  if (record.otp !== String(otp).trim()) {
    return res.status(400).json({ success: false, message: "Incorrect OTP. Please try again." });
  }

  // OTP verified – process the return
  otpStore.delete(transactionId);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const txRes = await client.query(
      `SELECT * FROM customer_transactions WHERE transaction_id = $1 FOR UPDATE`,
      [transactionId],
    );
    if (txRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Transaction not found." });
    }
    const tx = txRes.rows[0];

    if (tx.customer_id !== req.user.id) {
      await client.query("ROLLBACK");
      return res.status(403).json({ success: false, message: "This transaction doesn't belong to you." });
    }
    if (tx.status !== "Issued") {
      await client.query("ROLLBACK");
      return res.status(400).json({ success: false, message: "This component has already been returned." });
    }

    await client.query(
      `UPDATE customer_transactions SET status = 'Returned', return_date = NOW() WHERE transaction_id = $1`,
      [transactionId],
    );
    await client.query(
      `UPDATE products SET stock = stock + $1 WHERE product_id = $2`,
      [tx.quantity, tx.product_id],
    );

    await client.query("COMMIT");

    await logAudit(pool, {
      actorEmail: req.user.email,
      actorRole: req.user.role,
      action: "COMPONENT_RETURNED",
      description: `${tx.customer_name} returned ${tx.quantity} of product #${tx.product_id} (${tx.project_name}) via OTP`,
      metadata: { transactionId, productId: tx.product_id, quantity: tx.quantity },
    });

    res.json({ success: true, message: "Component returned successfully." });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error in /transactions/:id/return/verify-otp", err);
    res.status(500).json({ success: false, message: "Server error" });
  } finally {
    client.release();
  }
});

// Admin: list all customer transactions with search filters
app.get("/admin/transactions", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { customerName, componentName, projectName, status } = req.query;
    const conditions = [];
    const params = [];

    if (customerName) {
      params.push(`%${customerName}%`);
      conditions.push(`ct.customer_name ILIKE $${params.length}`);
    }
    if (componentName) {
      params.push(`%${componentName}%`);
      conditions.push(`p.name ILIKE $${params.length}`);
    }
    if (projectName) {
      params.push(`%${projectName}%`);
      conditions.push(`ct.project_name ILIKE $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`ct.status = $${params.length}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await pool.query(
      `
      SELECT
        ct.transaction_id AS "transactionId",
        ct.customer_id AS "customerId",
        ct.customer_name AS "customerName",
        p.name AS "componentName",
        ct.product_id AS "productId",
        ct.quantity,
        ct.project_name AS "projectName",
        ct.purpose,
        ct.rack_number AS "rackNumber",
        ct.issue_date AS "issueDate",
        ct.return_date AS "returnDate",
        ct.status
      FROM customer_transactions ct
      JOIN products p ON p.product_id = ct.product_id
      ${whereClause}
      ORDER BY ct.issue_date DESC
      `,
      params,
    );

    res.json({ success: true, transactions: result.rows });
  } catch (err) {
    console.error("Error in GET /admin/transactions", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Admin: summary cards for the direct issue/return workflow
app.get("/admin/summary", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM products) AS "totalComponents",
        (SELECT COALESCE(SUM(stock), 0) FROM products) AS "totalAvailableStock",
        (SELECT COUNT(*) FROM customer_transactions WHERE status = 'Issued') AS "componentsIssued",
        (SELECT COUNT(*) FROM customer_transactions WHERE status = 'Returned') AS "componentsReturned",
        (SELECT COUNT(*) FROM customer_transactions) AS "totalTransactions"
    `);
    res.json({ success: true, ...result.rows[0] });
  } catch (err) {
    console.error("Error in GET /admin/summary", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Configured DB host: ${process.env.DB_HOST}`);
  pool
    .query("SELECT 1")
    .then(() => console.log("✅ Database connection OK"))
    .catch((err) =>
      console.error(
        "❌ Could NOT connect to the database. Check backend/.env (DB_HOST/DB_USER/DB_PASSWORD) and that this Neon project is awake. Details:",
        err.message,
      ),
    );
});

// app.get("/seed", async (req, res) => {
//   for (let p of products) {
//     await pool.query(
//       `
//       INSERT INTO products
//       (
//         product_id,
//         name,
//         model,
//         price,
//         stock,
//         damaged,
//         original_stock,
//         image
//       )

//       VALUES
//       (
//         $1,$2,$3,$4,$5,$6,$7,$8
//       )
//       `,
//       [
//         p.productId,
//         p.name,
//         p.model,
//         p.price,
//         p.stock,
//         p.damaged,
//         p.originalStock,
//         p.image,
//       ],
//     );
//   }

//   res.send("Database Seeded");
// });
app.get("/issueComponents/:issueId", async (req, res) => {
  let issueId = req.params.issueId;

  const result = await pool.query(
    `
SELECT
  p.name,
  ic.quantity,
  ic.product_id AS productId
FROM issue_components ic
JOIN products p
ON ic.product_id = p.product_id
WHERE ic.issue_id = $1
`,
    [issueId],
  );

  res.json(result.rows);
});

app.get("/issueComponents", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        ic.issue_id AS "issueId",
        p.name,
        ic.quantity,
        ic.product_id AS "productId"
      FROM issue_components ic
      JOIN products p
      ON ic.product_id = p.product_id
    `);

    res.json(result.rows);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
});

app.get("/verify-token", (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      success: false
    });
  }

  try {

    const token = authHeader.split(" ")[1];

    jwt.verify(token, JWT_SECRET);

    res.json({
      success: true
    });

  } catch(err) {

    res.status(401).json({
      success: false
    });

  }
});

/* =========================================================================
   GAP-FILL FEATURES (added on top of the existing app -- see
   backend/migrations/20260721_gap_fill_features.sql for the schema changes
   these routes depend on)
   ========================================================================= */

// ---------- Suppliers ----------
app.get("/suppliers", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT supplier_id AS "supplierId", name, contact_info AS "contactInfo" FROM suppliers ORDER BY name`,
    );
    res.json({ success: true, suppliers: result.rows });
  } catch (err) {
    console.error("Error in GET /suppliers", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.post("/suppliers", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, contactInfo } = req.body;
    if (!name) {
      return res.json({ success: false, message: "Supplier name is required" });
    }
    const result = await pool.query(
      `INSERT INTO suppliers (name, contact_info) VALUES ($1,$2) RETURNING supplier_id AS "supplierId"`,
      [name, contactInfo || null],
    );
    res.json({ success: true, supplierId: result.rows[0].supplierId });
  } catch (err) {
    console.error("Error in POST /suppliers", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ---------- Stock Receiving ----------
// Fields: Component, Quantity, Supplier, Invoice Number, Received By, Date, Remarks
// Automatically increases inventory. Uses a transaction so the stock update
// and the stock_received history row are always consistent.
app.post("/stock/receive", authenticateToken, requireAdmin, async (req, res) => {
  const {
    productId,
    quantity,
    supplierId,
    supplierName,
    invoiceNumber,
    receivedBy,
    remarks,
    date,
  } = req.body;

  const qty = Number(quantity);
  if (!productId || !qty || qty <= 0) {
    return res.json({ success: false, message: "Product and a positive quantity are required" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const prodRes = await client.query(
      `SELECT product_id, name, stock FROM products WHERE product_id = $1 FOR UPDATE`,
      [productId],
    );
    if (prodRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.json({ success: false, message: "Product not found" });
    }
    const product = prodRes.rows[0];

    await client.query(
      `UPDATE products SET stock = stock + $1 WHERE product_id = $2`,
      [qty, productId],
    );

    const insertRes = await client.query(
      `
      INSERT INTO stock_received
        (product_id, quantity, supplier_id, supplier_name, invoice_number, received_by, received_by_email, remarks, received_date)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9, NOW()))
      RETURNING receipt_id AS "receiptId"
      `,
      [
        productId,
        qty,
        supplierId || null,
        supplierName || null,
        invoiceNumber || null,
        receivedBy || null,
        req.user ? req.user.email : null,
        remarks || null,
        date || null,
      ],
    );

    await client.query("COMMIT");

    await logAudit(pool, {
      actorEmail: req.user ? req.user.email : null,
      actorRole: req.user ? req.user.role : null,
      action: "STOCK_RECEIVED",
      description: `${receivedBy || (req.user ? req.user.email : "Someone")} received ${qty} ${product.name}${invoiceNumber ? " (Invoice " + invoiceNumber + ")" : ""}`,
      metadata: { productId, quantity: qty, supplierId, invoiceNumber },
    });

    res.json({ success: true, message: "Stock received successfully", receiptId: insertRes.rows[0].receiptId });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error in POST /stock/receive", err);
    res.status(500).json({ success: false, message: "Server error" });
  } finally {
    client.release();
  }
});

app.get("/stock/received", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { start, end } = req.query;
    const rows = await reportData.getStockReceived(
      pool,
      start ? new Date(start) : new Date(0),
      end ? new Date(end) : new Date(),
    );
    res.json({ success: true, stockReceived: rows });
  } catch (err) {
    console.error("Error in GET /stock/received", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ---------- Dashboard summary cards ----------
// Total Components, Available Inventory, Low Stock, Today's Usage,
// Today's Stock Received, Weekly Usage, Weekly Replacement.
app.get("/dashboard", authenticateToken, async (req, res) => {
  try {
    const summary = await reportData.getDashboardSummary(pool);
    res.json({ success: true, ...summary });
  } catch (err) {
    console.error("Error in GET /dashboard", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ---------- Reports: Daily / Weekly / Monthly / Custom ----------
// periodType: 'daily' | 'weekly' | 'monthly' | 'custom'
// for 'custom', pass ?start=YYYY-MM-DD&end=YYYY-MM-DD
app.get("/reports/pdf", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { periodType = "weekly", start, end } = req.query;
    const data = await reportData.getFullReportData(pool, periodType, start, end);
    const pdfBuffer = await generatePdfReport(data);
    const fileName = buildFileName(data, "pdf");

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error("Error in GET /reports/pdf", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.get("/reports/excel", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { periodType = "weekly", start, end } = req.query;
    const data = await reportData.getFullReportData(pool, periodType, start, end);
    const excelBuffer = await generateExcelReport(data);
    const fileName = buildFileName(data, "excel");

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(excelBuffer);
  } catch (err) {
    console.error("Error in GET /reports/excel", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// List previously generated (e.g. automatic weekly) reports on disk
app.get("/reports/list", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT report_id AS "reportId", report_type AS "reportType", format, file_name AS "fileName",
              period_start AS "periodStart", period_end AS "periodEnd", generated_by AS "generatedBy",
              created_at AS "createdAt"
       FROM reports ORDER BY created_at DESC`,
    );
    res.json({ success: true, reports: result.rows });
  } catch (err) {
    console.error("Error in GET /reports/list", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Download a previously generated report file by name
app.get("/reports/download/:fileName", authenticateToken, requireAdmin, (req, res) => {
  const fileName = pathForReports.basename(req.params.fileName); // prevent path traversal
  const filePath = pathForReports.join(REPORTS_DIR, fileName);
  if (!fsForReports.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: "Report not found" });
  }
  res.download(filePath, fileName);
});

// ---------- Audit Log ----------
app.get("/audit", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 200, 1000);
    const offset = Number(req.query.offset) || 0;
    const result = await pool.query(
      `
      SELECT log_id AS "logId", actor_email AS "actorEmail", actor_role AS "actorRole",
             action, description, metadata, created_at AS "createdAt"
      FROM audit_logs
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
      `,
      [limit, offset],
    );
    res.json({ success: true, logs: result.rows });
  } catch (err) {
    console.error("Error in GET /audit", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* =========================================================================
   E-COMMERCE MODULE: Amazon / Flipkart stock-received, sold, return, and
   adjustment transactions. Kept strictly separate from the general
   inventory/issue/return flows above -- the only thing shared is the
   `products` table (reused for SKU/name/stock, per the existing structure),
   which these routes keep in sync via `products.stock`.
   ========================================================================= */

// Effect on products.stock for each transaction type. Stock Received and
// Return add stock back in (goods coming into our inventory); Sold removes
// it (goods leaving to fulfil an Amazon/Flipkart order). Adjustment can go
// either way, based on adjustment_direction.
function ecommerceStockDelta(transactionType, quantity, adjustmentDirection) {
  const qty = Number(quantity);
  switch (transactionType) {
    case "Stock Received":
    case "Return":
      return qty;
    case "Sold":
      return -qty;
    case "Adjustment":
      return adjustmentDirection === "decrease" ? -qty : qty;
    default:
      return 0;
  }
}

const ECOMMERCE_PLATFORMS = ["Amazon", "Flipkart"];
const ECOMMERCE_TYPES = ["Stock Received", "Sold", "Return", "Adjustment"];

// Dashboard summary cards
app.get("/ecommerce/summary", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        platform,
        transaction_type AS "transactionType",
        adjustment_direction AS "adjustmentDirection",
        quantity,
        total_amount AS "totalAmount"
      FROM ecommerce_transactions
    `);

    const summary = {
      totalAmazonStock: 0,
      totalFlipkartStock: 0,
      amazonStockReceived: 0,
      flipkartStockReceived: 0,
      amazonUnitsSold: 0,
      flipkartUnitsSold: 0,
      totalEcommerceSales: 0,
    };

    for (const row of result.rows) {
      const qty = Number(row.quantity);
      const delta = ecommerceStockDelta(row.transactionType, qty, row.adjustmentDirection);
      const isAmazon = row.platform === "Amazon";

      if (isAmazon) summary.totalAmazonStock += delta;
      else summary.totalFlipkartStock += delta;

      if (row.transactionType === "Stock Received") {
        if (isAmazon) summary.amazonStockReceived += qty;
        else summary.flipkartStockReceived += qty;
      }
      if (row.transactionType === "Sold") {
        if (isAmazon) summary.amazonUnitsSold += qty;
        else summary.flipkartUnitsSold += qty;
        summary.totalEcommerceSales += Number(row.totalAmount) || 0;
      }
    }

    res.json({ success: true, summary });
  } catch (err) {
    console.error("Error in GET /ecommerce/summary", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// List transactions, with platform / type / search filtering
app.get("/ecommerce/transactions", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { platform, transactionType, search } = req.query;
    const conditions = [];
    const params = [];

    if (platform && ECOMMERCE_PLATFORMS.includes(platform)) {
      params.push(platform);
      conditions.push(`et.platform = $${params.length}`);
    }
    if (transactionType && ECOMMERCE_TYPES.includes(transactionType)) {
      params.push(transactionType);
      conditions.push(`et.transaction_type = $${params.length}`);
    }
    if (search && String(search).trim()) {
      params.push(`%${String(search).trim()}%`);
      const idx = params.length;
      conditions.push(
        `(p.name ILIKE $${idx} OR et.sku ILIKE $${idx} OR et.reference_number ILIKE $${idx})`,
      );
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await pool.query(
      `
      SELECT
        et.transaction_id AS "transactionId",
        et.platform,
        et.transaction_type AS "transactionType",
        et.product_id AS "productId",
        p.name AS "productName",
        et.sku,
        et.quantity,
        et.adjustment_direction AS "adjustmentDirection",
        et.unit_price AS "unitPrice",
        et.total_amount AS "totalAmount",
        et.reference_number AS "referenceNumber",
        et.transaction_date AS "transactionDate",
        et.notes,
        et.created_by_email AS "createdByEmail",
        et.created_at AS "createdAt",
        et.updated_at AS "updatedAt"
      FROM ecommerce_transactions et
      JOIN products p ON p.product_id = et.product_id
      ${whereClause}
      ORDER BY et.transaction_date DESC, et.transaction_id DESC
      `,
      params,
    );

    res.json({ success: true, transactions: result.rows });
  } catch (err) {
    console.error("Error in GET /ecommerce/transactions", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Create an E-Commerce transaction (Stock Received / Sold / Return / Adjustment)
// and apply its effect to the shared products.stock inventory.
app.post("/ecommerce/transactions", authenticateToken, requireAdmin, async (req, res) => {
  const {
    platform,
    transactionType,
    productId,
    sku,
    quantity,
    adjustmentDirection,
    unitPrice,
    referenceNumber,
    date,
    notes,
  } = req.body || {};

  if (!ECOMMERCE_PLATFORMS.includes(platform)) {
    return res.status(400).json({ success: false, message: "Platform must be Amazon or Flipkart." });
  }
  if (!ECOMMERCE_TYPES.includes(transactionType)) {
    return res.status(400).json({ success: false, message: "Invalid transaction type." });
  }
  const qty = Number(quantity);
  if (!productId || !Number.isInteger(qty) || qty <= 0) {
    return res.status(400).json({ success: false, message: "Product and a positive quantity are required." });
  }
  if (transactionType === "Adjustment" && !["increase", "decrease"].includes(adjustmentDirection)) {
    return res.status(400).json({ success: false, message: "Adjustment requires a direction (increase/decrease)." });
  }

  const price = Number(unitPrice) || 0;
  const totalAmount = price * qty;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const prodRes = await client.query(
      `SELECT product_id, name, stock FROM products WHERE product_id = $1 FOR UPDATE`,
      [productId],
    );
    if (prodRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Product not found." });
    }
    const product = prodRes.rows[0];

    const delta = ecommerceStockDelta(transactionType, qty, adjustmentDirection);
    if (Number(product.stock) + delta < 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ success: false, message: "Not enough stock available for this transaction." });
    }

    await client.query(`UPDATE products SET stock = stock + $1 WHERE product_id = $2`, [delta, productId]);

    const inserted = await client.query(
      `
      INSERT INTO ecommerce_transactions
        (platform, transaction_type, product_id, sku, quantity, adjustment_direction,
         unit_price, total_amount, reference_number, transaction_date, notes, created_by_email)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10, CURRENT_DATE),$11,$12)
      RETURNING transaction_id AS "transactionId"
      `,
      [
        platform,
        transactionType,
        productId,
        sku && String(sku).trim() ? String(sku).trim() : String(productId),
        qty,
        transactionType === "Adjustment" ? adjustmentDirection : null,
        price,
        totalAmount,
        referenceNumber || null,
        date || null,
        notes || null,
        req.user ? req.user.email : null,
      ],
    );

    await client.query("COMMIT");

    await logAudit(pool, {
      actorEmail: req.user ? req.user.email : null,
      actorRole: req.user ? req.user.role : null,
      action: "ECOMMERCE_TRANSACTION_CREATED",
      description: `${platform} ${transactionType}: ${qty} x ${product.name}${referenceNumber ? " (Ref " + referenceNumber + ")" : ""}`,
      metadata: { platform, transactionType, productId, quantity: qty, referenceNumber },
    });

    res.json({ success: true, message: "Transaction recorded successfully.", transactionId: inserted.rows[0].transactionId });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error in POST /ecommerce/transactions", err);
    res.status(500).json({ success: false, message: "Server error" });
  } finally {
    client.release();
  }
});

// Edit a transaction. Reverses the old stock effect and applies the new one
// so products.stock stays correct no matter what changed.
app.put("/ecommerce/transactions/:id", authenticateToken, requireAdmin, async (req, res) => {
  const transactionId = Number(req.params.id);
  const {
    platform,
    transactionType,
    productId,
    sku,
    quantity,
    adjustmentDirection,
    unitPrice,
    referenceNumber,
    date,
    notes,
  } = req.body || {};

  if (!ECOMMERCE_PLATFORMS.includes(platform)) {
    return res.status(400).json({ success: false, message: "Platform must be Amazon or Flipkart." });
  }
  if (!ECOMMERCE_TYPES.includes(transactionType)) {
    return res.status(400).json({ success: false, message: "Invalid transaction type." });
  }
  const qty = Number(quantity);
  if (!productId || !Number.isInteger(qty) || qty <= 0) {
    return res.status(400).json({ success: false, message: "Product and a positive quantity are required." });
  }
  if (transactionType === "Adjustment" && !["increase", "decrease"].includes(adjustmentDirection)) {
    return res.status(400).json({ success: false, message: "Adjustment requires a direction (increase/decrease)." });
  }

  const price = Number(unitPrice) || 0;
  const totalAmount = price * qty;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const txRes = await client.query(
      `SELECT * FROM ecommerce_transactions WHERE transaction_id = $1 FOR UPDATE`,
      [transactionId],
    );
    if (txRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Transaction not found." });
    }
    const oldTx = txRes.rows[0];

    // Lock both the old and new product rows (they may be the same row).
    const productIds = [...new Set([oldTx.product_id, Number(productId)])];
    const prodRes = await client.query(
      `SELECT product_id, name, stock FROM products WHERE product_id = ANY($1::int[]) FOR UPDATE`,
      [productIds],
    );
    const productsById = Object.fromEntries(prodRes.rows.map((p) => [p.product_id, p]));
    if (!productsById[productId]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Product not found." });
    }

    // Reverse the old effect on the old product.
    const oldDelta = ecommerceStockDelta(oldTx.transaction_type, oldTx.quantity, oldTx.adjustment_direction);
    await client.query(`UPDATE products SET stock = stock - $1 WHERE product_id = $2`, [oldDelta, oldTx.product_id]);

    // Apply the new effect on the new product, re-checking stock won't go negative.
    const newDelta = ecommerceStockDelta(transactionType, qty, adjustmentDirection);
    const baselineStock =
      Number(productsById[productId].stock) - (oldTx.product_id === Number(productId) ? oldDelta : 0);
    if (baselineStock + newDelta < 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ success: false, message: "Not enough stock available for this transaction." });
    }
    await client.query(`UPDATE products SET stock = stock + $1 WHERE product_id = $2`, [newDelta, productId]);

    await client.query(
      `
      UPDATE ecommerce_transactions SET
        platform = $1,
        transaction_type = $2,
        product_id = $3,
        sku = $4,
        quantity = $5,
        adjustment_direction = $6,
        unit_price = $7,
        total_amount = $8,
        reference_number = $9,
        transaction_date = COALESCE($10, transaction_date),
        notes = $11,
        updated_at = NOW()
      WHERE transaction_id = $12
      `,
      [
        platform,
        transactionType,
        productId,
        sku && String(sku).trim() ? String(sku).trim() : String(productId),
        qty,
        transactionType === "Adjustment" ? adjustmentDirection : null,
        price,
        totalAmount,
        referenceNumber || null,
        date || null,
        notes || null,
        transactionId,
      ],
    );

    await client.query("COMMIT");

    await logAudit(pool, {
      actorEmail: req.user ? req.user.email : null,
      actorRole: req.user ? req.user.role : null,
      action: "ECOMMERCE_TRANSACTION_UPDATED",
      description: `Updated ${platform} ${transactionType} transaction #${transactionId}`,
      metadata: { transactionId, platform, transactionType, productId, quantity: qty },
    });

    res.json({ success: true, message: "Transaction updated successfully." });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error in PUT /ecommerce/transactions/:id", err);
    res.status(500).json({ success: false, message: "Server error" });
  } finally {
    client.release();
  }
});

// Delete a transaction and reverse its effect on inventory.
app.delete("/ecommerce/transactions/:id", authenticateToken, requireAdmin, async (req, res) => {
  const transactionId = Number(req.params.id);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const txRes = await client.query(
      `SELECT * FROM ecommerce_transactions WHERE transaction_id = $1 FOR UPDATE`,
      [transactionId],
    );
    if (txRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Transaction not found." });
    }
    const tx = txRes.rows[0];

    const delta = ecommerceStockDelta(tx.transaction_type, tx.quantity, tx.adjustment_direction);
    await client.query(`UPDATE products SET stock = stock - $1 WHERE product_id = $2`, [delta, tx.product_id]);
    await client.query(`DELETE FROM ecommerce_transactions WHERE transaction_id = $1`, [transactionId]);

    await client.query("COMMIT");

    await logAudit(pool, {
      actorEmail: req.user ? req.user.email : null,
      actorRole: req.user ? req.user.role : null,
      action: "ECOMMERCE_TRANSACTION_DELETED",
      description: `Deleted ${tx.platform} ${tx.transaction_type} transaction #${transactionId}`,
      metadata: { transactionId, platform: tx.platform, transactionType: tx.transaction_type },
    });

    res.json({ success: true, message: "Transaction deleted successfully." });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error in DELETE /ecommerce/transactions/:id", err);
    res.status(500).json({ success: false, message: "Server error" });
  } finally {
    client.release();
  }
});
// Export E-Commerce transactions (respects the same platform/type/search
// filters as the list route) as an Excel file.
app.get("/ecommerce/transactions/export", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { platform, transactionType, search } = req.query;
    const conditions = [];
    const params = [];

    if (platform && ECOMMERCE_PLATFORMS.includes(platform)) {
      params.push(platform);
      conditions.push(`et.platform = $${params.length}`);
    }
    if (transactionType && ECOMMERCE_TYPES.includes(transactionType)) {
      params.push(transactionType);
      conditions.push(`et.transaction_type = $${params.length}`);
    }
    if (search && String(search).trim()) {
      params.push(`%${String(search).trim()}%`);
      const idx = params.length;
      conditions.push(
        `(p.name ILIKE $${idx} OR et.sku ILIKE $${idx} OR et.reference_number ILIKE $${idx})`,
      );
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await pool.query(
      `
      SELECT
        et.transaction_date AS "transactionDate",
        et.platform,
        et.transaction_type AS "transactionType",
        et.adjustment_direction AS "adjustmentDirection",
        p.name AS "productName",
        et.sku,
        et.quantity,
        et.unit_price AS "unitPrice",
        et.total_amount AS "totalAmount",
        et.reference_number AS "referenceNumber",
        et.notes,
        et.created_by_email AS "createdByEmail"
      FROM ecommerce_transactions et
      JOIN products p ON p.product_id = et.product_id
      ${whereClause}
      ORDER BY et.transaction_date DESC, et.transaction_id DESC
      `,
      params,
    );

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("E-Commerce Transactions");

    sheet.columns = [
      { header: "Date", key: "date", width: 14 },
      { header: "Platform", key: "platform", width: 12 },
      { header: "Transaction Type", key: "type", width: 20 },
      { header: "Product", key: "product", width: 30 },
      { header: "SKU", key: "sku", width: 16 },
      { header: "Quantity", key: "quantity", width: 12 },
      { header: "Unit Price", key: "unitPrice", width: 14 },
      { header: "Total Amount", key: "totalAmount", width: 16 },
      { header: "Reference/Order ID", key: "reference", width: 20 },
      { header: "Notes", key: "notes", width: 25 },
      { header: "Recorded By", key: "recordedBy", width: 22 },
    ];

    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).alignment = { horizontal: "center" };

    result.rows.forEach((row) => {
      sheet.addRow({
        date: row.transactionDate ? new Date(row.transactionDate).toLocaleDateString() : "",
        platform: row.platform,
        type:
          row.transactionType === "Adjustment" && row.adjustmentDirection
            ? `${row.transactionType} (${row.adjustmentDirection})`
            : row.transactionType,
        product: row.productName,
        sku: row.sku,
        quantity: row.quantity,
        unitPrice: Number(row.unitPrice),
        totalAmount: Number(row.totalAmount),
        reference: row.referenceNumber || "",
        notes: row.notes || "",
        recordedBy: row.createdByEmail || "",
      });
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=Ecommerce_Transactions_${new Date().toISOString().slice(0, 10)}.xlsx`,
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Error in GET /ecommerce/transactions/export", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});
// Start the automatic Sunday 11:59 PM weekly report job
startWeeklyReportCron(pool);

// Keep-warm ping: Neon's free tier suspends its compute after a period of
// inactivity, and the first query after that can be slow enough to time out
// (this is what causes "the server feels slow" and occasional connection
// errors). Pinging every 4 minutes keeps the connection warm during active
// use without meaningfully affecting Neon's usage quota. This has no effect
// once you close the server -- it only helps while you're actively testing.
setInterval(() => {
  pool.query("SELECT 1").catch((err) => {
    console.error("Keep-warm ping failed (this is usually harmless):", err.message);
  });
}, 4 * 60 * 1000);
