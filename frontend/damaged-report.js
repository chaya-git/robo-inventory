async function loadDamagedProducts() {
  const container = document.getElementById("damagedTableContainer");

  container.innerHTML = "Loading...";

  try {
    const response = await fetch(`${API_URL}/damagedProducts`);

    const rows = await response.json();

    if (!Array.isArray(rows) || rows.length === 0) {
      container.innerHTML = "<p>No damaged products found.</p>";

      return;
    }

    let html = `
      <table
        class="damaged-table"
        style="
          width:100%;
          border-collapse:collapse
        "
      >
        <thead>
          <tr>
            <th>Image</th>
            <th>Product Name</th>
            <th>Total Damaged</th>
            <th>Workshops</th>
            <th>Testing</th>
            <th>Projects</th>
            <th>Manual</th>
            <th>Details</th>
          </tr>
        </thead>

        <tbody>
    `;

    rows.forEach((p) => {
      const safeName = (p.name || "").replace(/"/g, "&quot;");

      html += `
        <tr
          data-pid="${p.productId}"
          data-pname="${safeName}"
        >

          <td>
            <img
              src="${p.image || ""}"
              style="
                width:56px;
                height:36px;
                object-fit:cover
              "
            >
          </td>

          <td>${p.name}</td>

          <td>${p.total_damaged}</td>

          <td>${p.damaged_workshop}</td>

          <td>${p.damaged_testing}</td>

          <td>${p.damaged_project}</td>

          <td>${p.damaged_manual}</td>

          <td>
            <button
              class="damagedDetailsBtn"
            >
              View Details
            </button>
          </td>

        </tr>

        <tr
          class="detailsRow"
          style="display:none"
        >
          <td
            colspan="8"
            id="details-${p.productId}"
          >
            Loading...
          </td>
        </tr>
      `;
    });

    html += `
      </tbody>
      </table>
    `;

    container.innerHTML = html;

    attachDetailHandlers();
  } catch (err) {
    console.error(err);

    container.innerHTML = "<p>Failed to load damaged products.</p>";
  }
}

function attachDetailHandlers() {
  const container = document.getElementById("damagedTableContainer");

  Array.from(container.querySelectorAll(".damagedDetailsBtn")).forEach(
    (btn) => {
      btn.addEventListener("click", async (e) => {
        const tr = e.target.closest("tr");

        const next = tr.nextElementSibling;

        const pid = tr.getAttribute("data-pid");

        if (!next) return;

        if (next.style.display === "none" || next.style.display === "") {
          next.style.display = "table-row";

          const detailsContainer = document.getElementById(`details-${pid}`);

          detailsContainer.innerHTML = "Loading details...";

          const resp = await fetch(
            `${API_URL}/damagedProducts/${pid}/details`,
          );

          const detailRows = await resp.json();

          if (!Array.isArray(detailRows) || detailRows.length === 0) {
            detailsContainer.innerHTML = "<p>No damage records found.</p>";

            return;
          }

          const map = {};

          detailRows.forEach((r) => {
            const issueType = String(r.issueType || "").trim();

            const projectName = String(
              r.issueName || r.projectName || "",
            ).trim();

            const qty = Number(r.damagedQty) || 0;

            if (qty <= 0) return;

            let label = "";

            if (issueType && projectName) {
              label = `${issueType} ${projectName}`;
            } else if (projectName) {
              label = projectName;
            } else if (issueType) {
              label = issueType;
            } else {
              label = "Unknown";
            }

            if (!map[label]) {
              map[label] = 0;
            }

            map[label] += qty;
          });

          const entries = Object.entries(map);

          detailsContainer.innerHTML = entries
            .map(([nm, v]) => `${nm} - damaged ${v}`)
            .join("<br>");
        } else {
          next.style.display = "none";
        }
      });
    },
  );
}

function goBack() {
  window.location.href = "index.html";
}

document.addEventListener("DOMContentLoaded", () => {
  loadDamagedProducts();

  loadMonths();

  loadMonthlyReport();

  document
    .getElementById("monthFilter")
    .addEventListener("change", loadMonthlyReport);
});

function loadMonths() {
  const select = document.getElementById("monthFilter");

  select.innerHTML = "";

  const today = new Date();

  for (let i = 0; i < 12; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);

    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
      2,
      "0",
    )}`;

    const label = d.toLocaleString("default", {
      month: "long",
      year: "numeric",
    });

    select.innerHTML += `
      <option value="${value}">
        ${label}
      </option>
    `;
  }
}
async function loadMonthlyReport() {
  const month = document.getElementById("monthFilter").value;

  const container = document.getElementById("monthlyTableContainer");

  container.innerHTML = "Loading...";

  const response = await fetch(
    `${API_URL}/damagedProducts/monthly?month=${month}`,
  );

  const rows = await response.json();

  let html = `
    <table
      class="damaged-table"
    >
      <thead>
        <tr>
          <th>Product</th>
          <th>Damaged Quantity</th>
        </tr>
      </thead>

      <tbody>
  `;

  rows.forEach((r) => {
    html += `
      <tr>
        <td>${r.name}</td>
        <td>${r.damaged_count}</td>
      </tr>
    `;
  });

  html += `
      </tbody>
    </table>
  `;

  container.innerHTML = html;
}

document.getElementById("downloadExcelBtn").addEventListener("click", () => {
  const month = document.getElementById("monthFilter").value;

  if (!month) {
    alert("Please select a month");

    return;
  }

  window.open(
    `${API_URL}/damagedProducts/export?month=${month}`,
    "_blank",
  );
});
