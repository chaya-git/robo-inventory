// console.log(API_URL);
// const token = localStorage.getItem("token");
// if (!token) {
//   window.location.href = "login.html";
// }

if (!localStorage.getItem("role")) {
  window.location.href = "login.html";
}
let role = localStorage.getItem("role");

let issuedProjects = [];
let issuedWorkshops = [];
let issuedTesting = [];
let products = [];
let projectItems = [];
let activeSession = null; // { type: 'Project'|'Workshop', projectName, venue, employees:[], names:[], components: [{productId, quantity}] }
let modalSelectedProduct = null;
let currentDamageIssueId = null;
let allIssueComponents = [];

async function checkAuth() {

  const token = localStorage.getItem("token");

  if (!token) {
    window.location.href = "login.html";
    return;
  }

  try {

    const response = await fetch(
      `${API_URL}/verify-token`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    if (!response.ok) {
      localStorage.clear();
      window.location.href = "login.html";
    }

  } catch(err) {

    localStorage.clear();
    window.location.href = "login.html";
  }
}

checkAuth();

async function loadProducts() {
  let response = await fetch(`${API_URL}/products`);
  products = await response.json();
  displayProducts();
  manageDashboard();
}

async function loadProjects() {
  let headers = {};
  const token = localStorage.getItem("token");
  if (token) headers["Authorization"] = "Bearer " + token;
  let response = await fetch(`${API_URL}/projects`, { headers });
  issuedProjects = await response.json();
  await displayProjectHistory();
  manageDashboard();
}

async function loadWorkshops() {
  let headers = {};
  const token = localStorage.getItem("token");
  if (token) headers["Authorization"] = "Bearer " + token;
  let response = await fetch(`${API_URL}/workshops`, { headers });
  issuedWorkshops = await response.json();
  await displayWorkshopHistory();
  manageDashboard();
}

async function loadTesting() {
  let headers = {};
  const token = localStorage.getItem("token");
  if (token) headers["Authorization"] = "Bearer " + token;
  let response = await fetch(`${API_URL}/testing`, { headers });
  issuedTesting = await response.json();
  await displayTestingHistory();
  manageDashboard();
}

async function loadIssueComponents() {
  const response = await fetch(`${API_URL}/issueComponents`);

  allIssueComponents = await response.json();
}
function renderProducts(arr) {
  const container = document.getElementById("products");
  container.innerHTML = "";

  arr.forEach((p) => {
    if (role === "Employee" && Number(p.stock) <= 0) {
      return;
    }

    let stockClass = "";

    if (role.toLowerCase() === "admin") {
      const stockPercent = (p.stock / p.originalStock) * 100;

      if (stockPercent < 20) {
        stockClass = "admin-critical";
      } else if (stockPercent < 40) {
        stockClass = "admin-low";
      } else {
        stockClass = "admin-healthy";
      }
    }

    container.innerHTML += `
      <div class="card ${stockClass}">

        <img src="${p.image}">

        <div style="flex:1">
          <h3>${p.name}</h3>

          <div class="card-info">
            <p><b>ID:</b> ${p.productId}</p>
            <p><b>Name:</b> ${p.name}</p>
            <p><b>Description:</b> ${p.model}</p>
            <p><b>Stock:</b> ${p.stock}</p>
            ${p.rackNumber ? `<p><b>Rack:</b> ${p.rackNumber}</p>` : ""}
            ${p.description ? `<p>${p.description}</p>` : ""}

            ${
              role !== "Employee"
                ? (p.stock / p.originalStock) * 100 < 20
                  ? `<p class="critical">🔴 Critical Stock</p>`
                  : (p.stock / p.originalStock) * 100 < 40
                    ? `<p class="low">🟡 Low Stock</p>`
                    : `<p class="healthy">🟢 Healthy Stock</p>`
                : ""
            }
          </div>
        </div>

        <div class="card-actions">
          <button onclick="openIssueModal(${p.productId})">
            Issue Component
          </button>

          ${
            role === "admin"
              ? `<button onclick="markDamaged(${p.productId})">
                  ⚠ Mark Damaged
                </button>
                <button onclick="openEditProductForm(${p.productId})">
                  ✏️ Edit
                </button>
                <button onclick="deleteProduct(${p.productId})">
                  🗑 Delete
                </button>`
              : ""
          }
        </div>

      </div>
    `;
  });
}
function displayProducts() {
  renderProducts(products);
}

/* ---------- Issue modal & session logic ---------- */
function openIssueModal(productId) {
  modalSelectedProduct = productId;
  const modal = document.getElementById("issueModal");
  const typeSelect = document.getElementById("issueTypeSelect");
  const sessionDetails = document.getElementById("sessionDetails");
  // default
  typeSelect.value = "Testing";
  // if active session exists, preselect its type
  if (activeSession) {
    typeSelect.value = activeSession.type;
  }
  // show or hide sessionDetails depending
  const employeeDetails = document.getElementById("employeeDetails");

  employeeDetails.style.display = "block";

  sessionDetails.style.display =
    typeSelect.value === "Testing"
      ? "none"
      : activeSession && activeSession.type === typeSelect.value
        ? "none"
        : "block";
  document.getElementById("issueQty").value = 1;
  modal.style.display = "flex";
}

// document.getElementById("issueTypeSelect").dispatchEvent(new Event("change"));
document.getElementById("testingDurationContainer").style.display = "block";

function closeModal() {
  document.getElementById("issueModal").style.display = "none";
}

document.addEventListener("click", (e) => {
  if (e.target && e.target.id === "closeModal") closeModal();
});

document.getElementById("issueTypeSelect").addEventListener("change", (e) => {
  const sessionDetails = document.getElementById("sessionDetails");

  const employeeDetails = document.getElementById("employeeDetails");

  const testingDurationContainer = document.getElementById(
    "testingDurationContainer",
  );

  const val = e.target.value;

  employeeDetails.style.display = "block";

  if (val === "Testing") {
    sessionDetails.style.display = "none";

    testingDurationContainer.style.display = "block";
  } else {
    testingDurationContainer.style.display = "none";

    sessionDetails.style.display =
      activeSession && activeSession.type === val ? "none" : "block";
  }
});

document
  .getElementById("modalActionBtn")
  .addEventListener("click", async () => {
    const type = document.getElementById("issueTypeSelect").value;
    const qty = Number(document.getElementById("issueQty").value) || 0;
    if (!modalSelectedProduct) return alert("No product selected");
    const prod = products.find((p) => p.productId === modalSelectedProduct);
    if (!prod) return alert("Product not found");
    if (qty <= 0 || qty > prod.stock)
      return alert("Invalid quantity or insufficient stock");

    if (type === "Testing") {
      // immediate issue for testing
      const empIds = document.getElementById("sessionEmpIds").value.trim();
      const empNames = document.getElementById("sessionEmpNames").value.trim();

      if (!empIds || !empNames) {
        return alert("Employee IDs and Employee Names are required");
      }
      const testingDuration = Number(
        document.getElementById("testingDuration").value,
      );

      if (!testingDuration || testingDuration <= 0) {
        return alert("Enter testing duration");
      }
      const issueData = {
        issueType: "Testing",
        employees: empIds.split(",").map((s) => s.trim()),
        names: empNames.split(",").map((s) => s.trim()),
        projectName: "Testing",
        venue: "",
        date: new Date().toISOString(),
        status: "Issued",

        testingDuration: Number(
          document.getElementById("testingDuration").value,
        ),

        components: [
          {
            productId: prod.productId,
            quantity: qty,
          },
        ],
      };
      const role = localStorage.getItem("role") || "";
      const token = localStorage.getItem("token") || "";
      if (String(role).toLowerCase() === "admin") {
        await immediateIssue(issueData);
        prod.stock -= qty;
        displayProducts();
        closeModal();
        return;
      } else {
        if (!token) {
          alert("Please sign in before submitting an issue request");
          return;
        }
        // backup and submit request
        const backupQty = qty;
        const resp = await fetch(`${API_URL}/issueRequests`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token,
          },
          body: JSON.stringify(issueData),
        });
        if (resp.status === 401) {
          alert("Not authenticated. Please sign in.");
          return;
        }
        const rr = await resp.json();
        if (!rr || rr.success === false) {
          alert(rr && rr.message ? rr.message : "Request failed");
          return;
        }
        // on success, decrement local stock to reflect reservation
        prod.stock -= qty;
        displayProducts();
        closeModal();
        return;
      }
    }

    // Workshop or Project
    if (!activeSession) {
      // first component: require details
      const name = document.getElementById("sessionName").value.trim();
      const venue = document.getElementById("sessionVenue").value.trim();
      const empIds = document.getElementById("sessionEmpIds").value.trim();
      const empNames = document.getElementById("sessionEmpNames").value.trim();
      if (!name || !venue || !empIds || !empNames)
        return alert("All session fields are required for the first component");
      activeSession = {
        type,
        projectName: name,
        venue,
        employees: empIds.split(",").map((s) => s.trim()),
        names: empNames.split(",").map((s) => s.trim()),
        date: new Date().toISOString(),
        status: "Issued",
        components: [{ productId: prod.productId, quantity: qty }],
      };
      // decrement stock locally
      prod.stock -= qty;
      renderActiveSession();
      displayProducts();
      closeModal();
      return;
    }

    // activeSession exists
    if (activeSession.type !== type)
      return alert(
        `Active session exists for ${activeSession.type}. Finish it first.`,
      );
    // just add component
    const existing = activeSession.components.find(
      (c) => c.productId === prod.productId,
    );
    if (existing) existing.quantity += qty;
    else
      activeSession.components.push({
        productId: prod.productId,
        quantity: qty,
      });
    prod.stock -= qty;
    renderActiveSession();
    displayProducts();
    closeModal();
  });

async function immediateIssue(issueData) {
  // backup projectItems so we can restore local stock if the server call fails
  const backupItems = projectItems.map((i) => ({ ...i }));
  try {
    const resp = await fetch(`${API_URL}/issue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(issueData),
    });
    const result = await resp.json();
    if (!result || result.success === false) {
      // restore local stock
      backupItems.forEach((item) => {
        const prod = products.find((p) => p.productId === item.productId);
        if (prod) prod.stock += Number(item.quantity || 0);
      });
      projectItems = backupItems;
      updateProject();
      displayProducts();
      alert(result && result.message ? result.message : "Failed to issue");
      return;
    }
    alert(result.message);
    await loadProjects();
    await loadWorkshops();
    await loadTesting();
    await loadProducts();
  } catch (err) {
    // restore on network error
    backupItems.forEach((item) => {
      const prod = products.find((p) => p.productId === item.productId);
      if (prod) prod.stock += Number(item.quantity || 0);
    });
    projectItems = backupItems;
    updateProject();
    displayProducts();
    console.error(err);
    alert("Failed to issue");
  }
}

function renderActiveSession() {
  const container = document.getElementById("activeSession");

  if (!activeSession) {
    container.innerHTML = "";
    return;
  }

  const componentsHtml =
    activeSession.components.length > 0
      ? activeSession.components
          .map((c) => {
            const product = products.find(
              (p) => Number(p.productId) === Number(c.productId),
            );

            return `
              <li>
                ${product ? product.name : "Unknown Product"}
                (ID: ${c.productId})
                x ${c.quantity}
              </li>
            `;
          })
          .join("")
      : "<li>No components selected yet</li>";

  container.innerHTML = `
    <div class="label">
      Currently Adding To:
      <strong>
        ${activeSession.type}: ${activeSession.projectName}
      </strong>
    </div>

    <div style="margin-top:15px">
      <h3>Selected Components</h3>

      <ul>
        ${componentsHtml}
      </ul>
    </div>

    <div class="actions">
      <button onclick="finishSession()">
        Finish ${activeSession.type}
      </button>

      <button onclick="cancelSession()">
        Cancel
      </button>
    </div>
  `;
}

async function finishSession() {
  if (!activeSession) return;
  // send to backend
  const issueData = {
    issueType: activeSession.type,
    employees: activeSession.employees,
    names: activeSession.names,
    projectName: activeSession.projectName,
    venue: activeSession.venue,
    date: activeSession.date,
    status: activeSession.status,
    components: activeSession.components,
  };
  const role = localStorage.getItem("role") || "";
  const token = localStorage.getItem("token") || "";
  if (String(role).toLowerCase() === "admin") {
    await immediateIssue(issueData);
  } else {
    if (!token) {
      alert("Please sign in before submitting an issue request");
      return;
    }
    // submit request and if it fails, restore local stock
    const backupComponents = activeSession.components.map((c) => ({ ...c }));
    const resp = await fetch(`${API_URL}/issueRequests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify(issueData),
    });
    if (resp.status === 401) {
      // restore local stock
      backupComponents.forEach((item) => {
        const prod = products.find((p) => p.productId === item.productId);
        if (prod) prod.stock += Number(item.quantity || 0);
      });
      alert("Not authenticated. Please sign in.");
      return;
    }
    const rr = await resp.json();
    if (!rr || rr.success === false) {
      backupComponents.forEach((item) => {
        const prod = products.find((p) => p.productId === item.productId);
        if (prod) prod.stock += Number(item.quantity || 0);
      });
      alert(rr && rr.message ? rr.message : "Request failed");
      return;
    }
    alert(rr.message || "Request submitted");
  }

  activeSession = null;
  renderActiveSession();
}

function cancelSession() {
  if (!activeSession) return;
  // restore stock for components in session
  activeSession.components.forEach((c) => {
    const prod = products.find((p) => p.productId === c.productId);
    if (prod) prod.stock += c.quantity;
  });
  activeSession = null;
  renderActiveSession();
  displayProducts();
}

/* ---------- Return modal logic ---------- */
let currentReturnIssue = null; // { issueId, issueType }
let currentAddIssue = null;
let currentReturnComponents = [];
let currentExchangeIssue = null;
function openReturnModal(issueId, issueType) {
  currentReturnIssue = { issueId, issueType };
  const modal = document.getElementById("returnModal");
  const list = document.getElementById("returnComponentsList");
  list.innerHTML = "Loading components...";
  modal.style.display = "flex";
  // fetch components
  fetch(`${API_URL}/issueComponents/${issueId}`)
    .then((r) => r.json())
    .then((comps) => {
      list.innerHTML = "";
      // normalize components into a local array so we don't depend on property naming
      currentReturnComponents = comps.map((c) => {
        const pid = c.productId ?? c.product_id ?? c.productid ?? 0;
        return {
          productId: Number(pid),
          issuedQty: Number(c.quantity || 0),
          name: c.name,
        };
      });

      currentReturnComponents.forEach((c, idx) => {
        const id = c.productId;
        const qty = c.issuedQty;
        const name = c.name;
        const row = document.createElement("div");
        row.innerHTML = `
        <p><b>${name}</b> - Issued: ${qty}</p>
        <label>Damaged: <input type="number" min="0" max="${qty}" value="0" data-idx="${idx}" data-issued="${qty}" data-name="${name}" class="damagedInput" /></label>
      `;
        list.appendChild(row);
      });
    })
    .catch(() => {
      list.innerHTML = "Failed to load components";
    });
}

document.getElementById("closeReturnModal").addEventListener("click", () => {
  document.getElementById("returnModal").style.display = "none";
});

document
  .getElementById("confirmReturnBtn")
  .addEventListener("click", async () => {
    if (!currentReturnIssue) return alert("No issue");
    const inputs = Array.from(document.querySelectorAll(".damagedInput"));
    const damaged = [];
    for (let inp of inputs) {
      const idx = Number(inp.getAttribute("data-idx"));
      const meta = currentReturnComponents[idx];
      if (!meta) continue;
      const pid = meta.productId;
      const issued = meta.issuedQty;
      const name = meta.name || "";
      const dmg = Number(inp.value) || 0;
      if (dmg < 0 || dmg > issued)
        return alert(`Invalid damaged quantity for ${name}`);
      if (dmg > 0) damaged.push({ productId: pid, damagedQty: dmg });
    }

    // send to backend
    const payload = { issueId: currentReturnIssue.issueId, damaged };
    try {
      // If user is admin, process immediately; otherwise create a return request for admin approval
      const role = localStorage.getItem("role") || "";
      let result = null;
      if (String(role).toLowerCase() === "admin") {
        const resp = await fetch(`${API_URL}/returnIssue`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        result = await resp.json();
      } else {
        // create return request
        const resp = await fetch(`${API_URL}/returnRequests`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + (localStorage.getItem("token") || ""),
          },
          body: JSON.stringify(payload),
        });
        result = await resp.json();
        if (result && result.success) {
          // Notify user and start polling for status
          const list = document.getElementById("returnComponentsList");
          list.innerHTML = `<p>Return request submitted to admin. You will be notified when approved or rejected.</p>`;
          document
            .querySelectorAll(".damagedInput")
            .forEach((i) => (i.disabled = true));
          document.getElementById("confirmReturnBtn").style.display = "none";
          // optional: start polling for this user's return request
          startReturnRequestPoll();
          return;
        }
      }

      if (!result || !result.success) {
        alert(result && result.message ? result.message : "Return failed");
        return;
      }

      // Show detailed summary in the modal
      const list = document.getElementById("returnComponentsList");
      list.innerHTML = `<h4>Return Processed</h4><p>${result.message}</p>`;
      const details = result.details || [];
      details.forEach((d) => {
        const prod = products.find((p) => p.productId === d.productId) || {};
        const name = prod.name || `Product ${d.productId}`;
        const row = document.createElement("div");
        row.innerHTML = `
        <p><b>${name}</b> — Issued: ${d.issuedQty}, Damaged: ${d.damagedQty}, Returned: ${d.returnedQty}</p>
        <p>Current stock: ${d.currentStock}, Current damaged: ${d.currentDamaged}</p>
      `;
        list.appendChild(row);
      });

      // Hide inputs and replace confirm button with a close button
      document
        .querySelectorAll(".damagedInput")
        .forEach((i) => (i.disabled = true));
      const btn = document.getElementById("confirmReturnBtn");
      btn.style.display = "none";

      let closeBtn = document.getElementById("closeReturnDoneBtn");
      if (!closeBtn) {
        closeBtn = document.createElement("button");
        closeBtn.id = "closeReturnDoneBtn";
        closeBtn.innerText = "Close";
        closeBtn.style.marginTop = "12px";
        closeBtn.addEventListener("click", async () => {
          document.getElementById("returnModal").style.display = "none";
          currentReturnIssue = null;
          await loadProducts();
          await loadWorkshops();
          await loadProjects();
          await loadTesting();
          // restore confirm button
          document.getElementById("confirmReturnBtn").style.display =
            "inline-block";
          closeBtn.remove();
        });
        document.getElementById("returnModalBody").appendChild(closeBtn);
      }
    } catch (err) {
      console.error(err);
      alert("Return failed");
    }
  });

/* ---------- end return modal logic ---------- */

/* ---------- Damaged Products modal + logic ---------- */

function openDamagedModal() {
  const modal = document.getElementById("damagedModal");
  const container = document.getElementById("damagedTableContainer");
  modal.style.display = "flex";
  container.innerHTML = "Loading...";
  fetch(`${API_URL}/damagedProducts`)
    .then((r) => r.json())
    .then((rows) => {
      if (!Array.isArray(rows) || rows.length === 0) {
        container.innerHTML = "<p>No damaged products found.</p>";
        return;
      }

      // build table header
      let html = `
        <table class="damaged-table" style="width:100%;border-collapse:collapse">
          <thead>
            <tr>
              <th style="text-align:left;padding:8px">Image</th>
              <th style="text-align:left;padding:8px">Product Name</th>
              <th style="text-align:right;padding:8px">Total Damaged</th>
              <th style="text-align:right;padding:8px">Workshops</th>
              <th style="text-align:right;padding:8px">Testing</th>
              <th style="text-align:right;padding:8px">Projects</th>
              <th style="padding:8px">Details</th>
            </tr>
          </thead>
          <tbody>
      `;

      rows.forEach((p) => {
        const safeName = (p.name || "").replace(/"/g, "&quot;");
        html += `
          <tr data-pid="${p.productId}" data-pname="${safeName}" style="border-top:1px solid #eee">
            <td style="padding:8px"><img src="${p.image || ""}" style="width:56px;height:36px;object-fit:cover;border-radius:4px"/></td>
            <td style="padding:8px">${p.name}</td>
            <td style="padding:8px;text-align:right">${p.total_damaged}</td>
            <td style="padding:8px;text-align:right">${p.damaged_workshop}</td>
            <td style="padding:8px;text-align:right">${p.damaged_testing}</td>
            <td style="padding:8px;text-align:right">${p.damaged_project}</td>
            <td style="padding:8px;text-align:center"><button class="damagedDetailsBtn">View Details</button></td>
          </tr>
          <tr class="detailsRow" style="display:none;background:#fafafa">
            <td colspan="7" style="padding:12px" id="details-${p.productId}">Loading...</td>
          </tr>
        `;
      });

      html += `</tbody></table>`;
      container.innerHTML = html;

      // attach handlers
      Array.from(container.querySelectorAll(".damagedDetailsBtn")).forEach(
        (btn) => {
          btn.addEventListener("click", async (e) => {
            const tr = e.target.closest("tr");
            const next = tr.nextElementSibling;
            const pid = tr.getAttribute("data-pid");
            if (!next) return;
            if (next.style.display === "none" || next.style.display === "") {
              next.style.display = "table-row";
              const detailsContainer = document.getElementById(
                `details-${pid}`,
              );
              detailsContainer.innerHTML = "Loading details...";
              try {
                const resp = await fetch(
                  `${API_URL}/damagedProducts/${pid}/details`,
                );
                const detailRows = await resp.json();
                if (!Array.isArray(detailRows) || detailRows.length === 0) {
                  detailsContainer.innerHTML =
                    "<p>No damage records found.</p>";
                } else {
                  // Group by issue name and sum damaged quantities. Skip undefined names and zero values.
                  const map = {};
                  detailRows.forEach((r) => {
                    const issueType = String(r.issueType || "").trim();
                    // r.issueName comes from project_name AS issueName in backend; fallback to projectName alias if present
                    const projectName = String(
                      r.issueName || r.projectName || "",
                    ).trim();
                    const qty = Number(r.damagedQty) || 0;
                    if (qty <= 0) return; // skip non-positive
                    let label = "";
                    if (issueType && projectName)
                      label = `${issueType} ${projectName}`;
                    else if (projectName) label = projectName;
                    else if (issueType) label = issueType;
                    else label = "Unknown";
                    if (!map[label]) map[label] = 0;
                    map[label] += qty;
                  });

                  const entries = Object.entries(map);
                  if (entries.length === 0) {
                    detailsContainer.innerHTML =
                      "<div>No damage records found.</div>";
                  } else {
                    // Render exactly: "<IssueType> <IssueName> - damaged <qty>" per line
                    const lines = entries.map(([nm, v]) => {
                      // nm is already built from issueType + projectName where possible
                      return `${nm} - damaged ${v}`;
                    });
                    detailsContainer.innerHTML = lines.join("<br>");
                  }
                }
              } catch (err) {
                detailsContainer.innerHTML = "<p>Error loading details</p>";
              }
            } else {
              next.style.display = "none";
            }
          });
        },
      );
    })
    .catch((err) => {
      console.error(err);
      container.innerHTML = "<p>Failed to load damaged products.</p>";
    });
}

document.getElementById("closeDamagedModal").addEventListener("click", () => {
  document.getElementById("damagedModal").style.display = "none";
});

function addToProject(id) {
  let product = products.find((p) => p.productId === id);
  if (!product || product.stock <= 0) {
    alert("Out of Stock");
    return;
  }
  let existing = projectItems.find((p) => p.productId === id);
  if (existing) {
    existing.quantity++;
  } else {
    projectItems.push({ ...product, quantity: 1 });
  }
  product.stock--;
  displayProducts();
  updateProject();
  manageDashboard();
}

function updateProject() {
  let container = document.getElementById("projectList");
  container.innerHTML = "";
  projectItems.forEach((item) => {
    container.innerHTML += `
      <div class="card">
        <h3>${item.name}</h3>
        <p>Description: ${item.model}</p>
        <p>Quantity: ${item.quantity}</p>
        <button onclick="decQty(${item.productId})">-</button>
        <button onclick="incQty(${item.productId})">+</button>
        <button onclick="removeProd(${item.productId})">Remove</button>
      </div>
    `;
  });
}

function incQty(id) {
  let item = projectItems.find((p) => p.productId === id);
  let prod = products.find((p) => p.productId === id);
  if (prod && prod.stock > 0) {
    item.quantity++;
    prod.stock--;
  }
  displayProducts();
  updateProject();
  manageDashboard();
}

function decQty(id) {
  let item = projectItems.find((p) => p.productId === id);
  let prod = products.find((p) => p.productId === id);
  if (!item) return;
  if (item.quantity > 1) {
    item.quantity--;
    if (prod) prod.stock++;
  } else {
    removeProd(id);
    return;
  }
  displayProducts();
  updateProject();
  manageDashboard();
}

function removeProd(id) {
  let item = projectItems.find((p) => p.productId === id);
  let prod = products.find((p) => p.productId === id);
  if (item && prod) prod.stock += item.quantity;
  projectItems = projectItems.filter((p) => p.productId !== id);
  displayProducts();
  updateProject();
  manageDashboard();
}

async function issueComponents() {
  let empIds = document.getElementById("empIds").value;
  let employees = empIds.split(",");
  let empNames = document.getElementById("empNames").value;
  let names = empNames.split(",");
  let projectName = document.getElementById("projectName").value;
  let venue = document.getElementById("venue").value;
  let date = document.getElementById("date").value;
  let issueType = document.getElementById("issueType").value;

  // Validate per issue type
  if (!empIds || !empNames) {
    alert("Employee IDs and Names are required");
    return;
  }
  if (issueType === "Workshop" || issueType === "Project") {
    if (!projectName || !venue) {
      alert("Project/Workshop Name and Venue are required");
      return;
    }
  }
  // default date to today if not provided
  if (!date) {
    const d = new Date();
    date = d.toISOString().split("T")[0];
  }

  if (projectItems.length === 0) {
    alert("No Components Selected");
    return;
  }

  let issueData = {
    issueType,
    employees,
    names,
    projectName,
    venue,
    date,
    status: "Issued",
    components: [...projectItems],
  };

  const role = localStorage.getItem("role") || "";
  const token = localStorage.getItem("token") || "";
  if (String(role).toLowerCase() === "admin") {
    // admin issues immediately; if it fails, restore local stock
    const backupItems = projectItems.map((i) => ({ ...i }));
    let response = await fetch(`${API_URL}/issue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(issueData),
    });
    let result = await response.json();
    if (!result || result.success === false) {
      // restore local stock
      backupItems.forEach((item) => {
        const prod = products.find((p) => p.productId === item.productId);
        if (prod) prod.stock += Number(item.quantity || 0);
      });
      projectItems = backupItems;
      updateProject();
      displayProducts();
      alert(result && result.message ? result.message : "Failed to issue");
      return;
    }
    alert(result.message);
  } else {
    // submit issue request for admin approval; restore local stock on failure
    if (!token) {
      alert("Please sign in before submitting an issue request");
      return;
    }
    const backupItems = projectItems.map((i) => ({ ...i }));
    const resp = await fetch(`${API_URL}/issueRequests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify(issueData),
    });
    if (resp.status === 401) {
      // restore
      backupItems.forEach((item) => {
        const prod = products.find((p) => p.productId === item.productId);
        if (prod) prod.stock += Number(item.quantity || 0);
      });
      projectItems = backupItems;
      updateProject();
      displayProducts();
      alert("Not authenticated. Please sign in.");
      return;
    }
    const rr = await resp.json();
    if (!rr || rr.success === false) {
      // restore
      backupItems.forEach((item) => {
        const prod = products.find((p) => p.productId === item.productId);
        if (prod) prod.stock += Number(item.quantity || 0);
      });
      projectItems = backupItems;
      updateProject();
      displayProducts();
      alert(rr && rr.message ? rr.message : "Request failed");
      return;
    }
    alert(rr.message || "Request submitted");
  }

  projectItems = [];
  updateProject();
  await loadProjects();
  await loadWorkshops();
  await loadProducts();
  manageDashboard();
}

function toggleIssueFields() {
  const type = document.getElementById("issueType").value;

  const projectField = document.getElementById("projectName");
  const venueField = document.getElementById("venue");

  if (type === "Testing") {
    projectField.style.display = "none";
    venueField.style.display = "none";

    projectField.value = "";
    venueField.value = "";
  } else {
    projectField.style.display = "block";
    venueField.style.display = "block";
  }
}

function displayFilteredProducts(arr) {
  renderProducts(arr);
}

async function displayProjectHistory() {
  let container = document.getElementById("projectHistory");
  container.innerHTML = "";
  for (let [index, proj] of issuedProjects.entries()) {
    let components = allIssueComponents.filter(
      (c) => c.issueId === proj.issueId,
    );
    let componentsHTML = "";
    components.forEach((component) => {
      componentsHTML += `<p>${component.name} x ${component.quantity}</p>`;
    });

    container.innerHTML += `
      <div class="card history-card"
     data-employee="${proj.employeeNames}">
        <h3>${proj.issueType}</h3>
        <p><b>Project Name:</b> ${proj.projectName}</p>
        <p><b>Employee IDs:</b> ${proj.employeeIds}</p>
        <p><b>Employee Names:</b> ${proj.employeeNames}</p>
        <p><b>Venue:</b> ${proj.venue}</p>
        <p><b>Date:</b> ${new Date(proj.date).toLocaleDateString("en-GB")}</p>
        <p><b>Issue ID:</b> ${proj.issueId}</p>
        <p><b>Status:</b> ${proj.status}</p>
        <h4>Components Used</h4>
        ${componentsHTML}
        ${
          proj.status !== "Returned" && String(role).toLowerCase() !== "admin"
            ? `
    <button onclick="openReturnModal(${proj.issueId}, 'Project')">
      Return Components
    </button>
    <button onclick="openExchangeModal(${proj.issueId})">
      Exchange Components
    </button>
    <button onclick="openAddComponentsModal(${proj.issueId}, 'Project')">
      Add Components
    </button>
    <button onclick="openDamageModal(${proj.issueId})">
      Replace Damaged Components
    </button>
  `
            : ""
        }
      </div>
    `;
  }
}

async function returnProject(index) {
  let project = issuedProjects[index];
  let response = await fetch(`${API_URL}/returnProject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ issueId: project.issueId }),
  });
  let result = await response.json();
  alert(result.message);
  await loadProducts();
  await loadProjects();
}

async function displayWorkshopHistory() {
  let container = document.getElementById("workshopHistory");
  container.innerHTML = "";
  for (let [index, proj] of issuedWorkshops.entries()) {
    let components = allIssueComponents.filter(
      (c) => c.issueId === proj.issueId,
    );
    let componentsHTML = "";
    components.forEach((component) => {
      componentsHTML += `<p>${component.name} x ${component.quantity}</p>`;
    });

    container.innerHTML += `
      <div class="card history-card"
     data-employee="${proj.employeeNames}">
        <h3>${proj.issueType}</h3>
        <p><b>Workshop Name:</b> ${proj.projectName}</p>
        <p><b>Employee IDs:</b> ${proj.employeeIds}</p>
        <p><b>Employee Names:</b> ${proj.employeeNames}</p>
        <p><b>Venue:</b> ${proj.venue}</p>
        <p><b>Date:</b> ${new Date(proj.date).toLocaleDateString("en-GB")}</p>
        <p><b>Issue ID:</b> ${proj.issueId}</p>
        <p><b>Status:</b> ${proj.status}</p>
        <h4>Components Used</h4>
        ${componentsHTML}
        ${
          proj.status !== "Returned" && String(role).toLowerCase() !== "admin"
            ? `
    <button onclick="openReturnModal(${proj.issueId}, 'Workshop')">
      Return Components
    </button>
    <button onclick="openExchangeModal(${proj.issueId})">
      Exchange Components
    </button>
    <button onclick="openAddComponentsModal(${proj.issueId}, 'Workshop')">
      Add Components
    </button>
    <button onclick="openDamageModal(${proj.issueId})">
      Replace Damaged Components
    </button>
  `
            : ""
        }
      </div>
    `;
  }
}

async function returnWorkshop(index) {
  let workshop = issuedWorkshops[index];
  let response = await fetch(`${API_URL}/returnWorkshop`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ issueId: workshop.issueId }),
  });
  let result = await response.json();
  alert(result.message);
  await loadProducts();
  await loadWorkshops();
}

async function displayTestingHistory() {
  // console.log(issuedTesting[0]);
  let container = document.getElementById("testingHistory");
  container.innerHTML = "";

  for (let [index, t] of issuedTesting.entries()) {
    let components = allIssueComponents.filter((c) => c.issueId === t.issueId);

    let componentsHTML = "";

    components.forEach((component) => {
      componentsHTML += `<p>${component.name} x ${component.quantity}</p>`;
    });

    const expectedReturn = t.expectedReturnDate
      ? new Date(t.expectedReturnDate)
      : null;

    const isExpired = expectedReturn && new Date() > expectedReturn;

    container.innerHTML += `
      <div class="card history-card"
           data-employee="${t.employeeNames || ""}">

        <h3>${t.issueType}</h3>

        <p><b>Performed By:</b> ${t.employeeNames || ""}</p>

        <p><b>Employee IDs:</b> ${t.employeeIds || ""}</p>

        <p><b>Date:</b> ${new Date(t.date).toLocaleDateString("en-GB")}</p>

        <p><b>No. of Components:</b> ${components.length}</p>

        <p>
          <b>Expected Return:</b>
          ${
            expectedReturn
              ? expectedReturn.toLocaleDateString("en-GB")
              : "Not Set"
          }
        </p>

        <p>
          <b>Status:</b>
          ${isExpired ? "Expired 🔴" : "Active 🟢"}
        </p>

        <h4>Components</h4>

        ${componentsHTML}

        ${
          t.status !== "Returned" && String(role).toLowerCase() !== "admin"
            ? `
              <button onclick="openReturnModal(${t.issueId}, 'Testing')">
                Return Components
              </button>

              <button onclick="openExchangeModal(${t.issueId})">
                Exchange Components
              </button>

              <button onclick="openAddComponentsModal(${t.issueId}, 'Testing')">
                Add Components
              </button>

              <button onclick="openDamageModal(${t.issueId})">
                Replace Damaged Components
              </button>

              ${
                isExpired
                  ? `
                    <button onclick="requestExtension(${t.issueId})">
                      Request Extension
                    </button>
                  `
                  : ""
              }
            `
            : ""
        }

      </div>
    `;
  }
}

function toggleMode() {
  document.body.classList.toggle("dark");
  let btn = document.getElementById("modeBtn");
  if (document.body.classList.contains("dark")) btn.innerText = "☀️ Light Mode";
  else btn.innerText = "🌙 Dark Mode";
}

function searchProducts() {
  let value = document.getElementById("search").value.toLowerCase();
  let filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(value) ||
      p.productId.toString().includes(value) ||
      p.model.toLowerCase().includes(value),
  );
  displayFilteredProducts(filtered);
}

function manageDashboard() {
  let totalProducts = products.length;
  let totalStock = 0;
  let damagedCount = 0;

  products.forEach((prod) => {
    totalStock += prod.stock;
    damagedCount += prod.damaged;
  });

  let issuedCount = issuedProjects.length + issuedWorkshops.length;
  let container = document.getElementById("dashboard");
  container.innerHTML = `

  <div class="card">
    <h3>Total Products</h3>
    <p>${totalProducts}</p>
  </div>

  <div class="card">
    <h3>Total Stock</h3>
    <p>${totalStock}</p>
  </div>

  <div class="card">
    <h3>Issued Records</h3>
    <p>${issuedCount}</p>
  </div>

  <div class="card">
    <h3>Damaged Items</h3>
    <p>${damagedCount}</p>
  </div>

  `;

  if (typeof loadDashboardExtras === "function") {
    loadDashboardExtras();
  }
}

function downloadReport() {
  let csv = "ID,Name,Model,Stock,Price,Inventory Value\n";
  products.forEach((prod) => {
    let value = (prod.price || 0) * prod.stock;
    csv += `${prod.productId},${prod.name},${prod.model},${prod.stock},${prod.price || ""},${value}\n`;
  });
  let blob = new Blob([csv], { type: "text/csv" });
  let url = URL.createObjectURL(blob);
  let a = document.createElement("a");
  a.href = url;
  a.download = "inventory_report.csv";
  a.click();
}

async function markDamaged(id) {
  let qty = prompt("Enter damaged quantity");
  qty = Number(qty);
  let response = await fetch(`${API_URL}/markDamaged`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, qty }),
  });
  let result = await response.json();
  alert(result.message);
  await loadProducts();
  manageDashboard();
}

function searchById() {
  let value = document.getElementById("searchId").value;
  if (value === "") {
    displayProducts();
    return;
  }
  let filtered = products.filter((p) => p.productId === Number(value));
  displayFilteredProducts(filtered);
}

function searchByName() {
  let value = document.getElementById("searchName").value.toLowerCase();

  if (value === "") {
    displayProducts();
    return;
  }

  let filtered = products.filter((p) =>
    p.name.toLowerCase().includes(value)
  );

  displayFilteredProducts(filtered);
}

function logout() {
  localStorage.removeItem("role");
  localStorage.removeItem("token");
  window.location.href = "login.html";
}

function checkRole() {
  const roleLower = String(role || "").toLowerCase();
  const isAdmin = roleLower === "admin";

  document.getElementById("issueForm").style.display = "block";
  document.getElementById("addProductBtn").style.display = isAdmin
    ? "inline-block"
    : "none";
  document.getElementById("addProductForm").style.display = "none";

  const legacySection = document.getElementById("legacyAdminSection");
  if (legacySection) legacySection.style.display = isAdmin ? "block" : "none";

  const dbtn = document.getElementById("damagedBtn");
  if (dbtn) dbtn.style.display = isAdmin ? "inline-block" : "none";
  const srb = document.getElementById("stockReceiveBtn");
  if (srb) srb.style.display = isAdmin ? "inline-block" : "none";
  const rpb = document.getElementById("reportsBtn");
  if (rpb) rpb.style.display = isAdmin ? "inline-block" : "none";
  const alb = document.getElementById("auditLogBtn");
  if (alb) alb.style.display = isAdmin ? "inline-block" : "none";
  const atb = document.getElementById("adminTransactionsBtn");
  if (atb) atb.style.display = isAdmin ? "inline-block" : "none";
  const ecb = document.getElementById("ecommerceNavBtn");
  if (ecb) ecb.style.display = isAdmin ? "inline-block" : "none";

  const componentsSection = document.getElementById("componentsSection");
  if (componentsSection) componentsSection.style.display = isAdmin ? "none" : "block";
  const myTransactionsSection = document.getElementById("myTransactionsSection");
  if (myTransactionsSection)
    myTransactionsSection.style.display = isAdmin ? "none" : "block";

  if (!isAdmin) {
    loadComponents();
    loadMyTransactions();
  }
}

// function toggleAdminPassword() {
//   const input = document.getElementById("adminPass");
//   const btn = document.getElementById("toggleAdminPass");

//   if (input.type === "password") {
//     input.type = "text";
//     btn.textContent = "🙈";
//   } else {
//     input.type = "password";
//     btn.textContent = "👁️";
//   }
// }

/* Notifications helper (stored in localStorage) */
function getNotifications() {
  try {
    return JSON.parse(localStorage.getItem("notifications") || "[]");
  } catch (e) {
    return [];
  }
}
function saveNotifications(arr) {
  localStorage.setItem("notifications", JSON.stringify(arr));
}
function addNotification(msg) {
  const arr = getNotifications();
  arr.unshift({
    id: Date.now(),
    msg,
    read: false,
    ts: new Date().toISOString(),
  });
  saveNotifications(arr);
  renderNotifications();
}
function markNotificationRead(id) {
  const arr = getNotifications();
  const it = arr.find((x) => x.id == id);
  if (it) it.read = true;
  saveNotifications(arr);
  renderNotifications();
}
function renderNotifications() {
  const btn = document.getElementById("notificationsBtn");
  const dd = document.getElementById("notificationsDropdown");
  if (!btn || !dd) return;
  const arr = getNotifications();
  const unread = arr.filter((x) => !x.read).length;
  if (unread) btn.innerHTML = `🔔 <span class="notif-count">${unread}</span>`;
  else btn.innerHTML = `🔔`;
  if (arr.length === 0) {
    dd.innerHTML = '<div class="notif-item">No notifications</div>';
    return;
  }
  let html = "";
  arr.forEach((n) => {
    html += `<div class="notif-item ${n.read ? "" : "unread"}" data-id="${n.id}"><div>${n.msg}</div><div class="time">${new Date(n.ts).toLocaleString()}</div></div>`;
  });
  html +=
    '<div class="notif-actions"><button onclick="clearNotifications()">Clear All</button></div>';
  dd.innerHTML = html;
  // attach click handlers
  Array.from(dd.querySelectorAll(".notif-item")).forEach((el) =>
    el.addEventListener("click", () => {
      const id = el.getAttribute("data-id");
      markNotificationRead(id);
    }),
  );
}
function clearNotifications() {
  localStorage.removeItem("notifications");
  renderNotifications();
}
function toggleNotifications() {
  const dd = document.getElementById("notificationsDropdown");
  if (!dd) return;
  dd.style.display = dd.style.display === "none" ? "block" : "none";
}

// render on load
document.addEventListener("DOMContentLoaded", () => {
  renderNotifications();
});

function showAddProductForm() {
  let form = document.getElementById("addProductForm");
  form.style.display = form.style.display === "none" ? "block" : "none";
}

async function addProduct() {
  let name = document.getElementById("newName").value;
  let model = document.getElementById("newModel").value;
  let price = Number(document.getElementById("newPrice").value);
  let stock = Number(document.getElementById("newStock").value);
  let image = document.getElementById("newImage").value;
  let rackNumber = document.getElementById("newRack").value;
  let description = document.getElementById("newDescription").value;

  let response = await fetch(`${API_URL}/addProduct`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, model, price, stock, image, rackNumber, description }),
  });

  let result = await response.json();
  alert(result.message);
  await loadProducts();
}

// ---------- Inventory Management: Edit / Delete (admin) ----------
function openEditProductForm(productId) {
  const p = products.find((x) => Number(x.productId) === Number(productId));
  if (!p) return;
  const name = prompt("Name", p.name);
  if (name === null) return;
  const model = prompt("Model", p.model);
  if (model === null) return;
  const price = prompt("Price", p.price);
  if (price === null) return;
  const stock = prompt("Stock", p.stock);
  if (stock === null) return;
  const image = prompt("Image URL", p.image);
  if (image === null) return;
  const rackNumber = prompt("Rack Number", p.rackNumber || "");
  if (rackNumber === null) return;
  const description = prompt("Description", p.description || "");
  if (description === null) return;

  fetch(`${API_URL}/products/${productId}`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({
      name,
      model,
      price: Number(price),
      stock: Number(stock),
      image,
      rackNumber,
      description,
    }),
  })
    .then((r) => r.json())
    .then((res) => {
      alert(res.message);
      loadProducts();
    })
    .catch((err) => console.error(err));
}

function deleteProduct(productId) {
  if (!confirm("Delete this product? This cannot be undone.")) return;
  fetch(`${API_URL}/products/${productId}`, {
    method: "DELETE",
    headers: authHeaders(),
  })
    .then((r) => r.json())
    .then((res) => {
      alert(res.message);
      loadProducts();
    })
    .catch((err) => console.error(err));
}

// ---------- Direct issue/return workflow (customer-facing) ----------
let currentTakeComponent = null;
let allComponents = []; // cached for search/filter

async function loadComponents() {
  const container = document.getElementById("componentsGrid");
  if (!container) return;
  container.innerHTML = "Loading...";
  try {
    const resp = await fetch(`${API_URL}/components`, { headers: authHeaders() });
    const data = await resp.json();
    if (!data.success) {
      container.innerHTML = "<p>Could not load components.</p>";
      return;
    }
    allComponents = data.components; // store for search
    renderComponentCards(allComponents);
  } catch (err) {
    console.error(err);
    container.innerHTML = "<p>Error loading components.</p>";
  }
}

function renderComponentCards(components) {
  const container = document.getElementById("componentsGrid");
  if (!container) return;
  if (components.length === 0) {
    container.innerHTML = "<p>No components found.</p>";
    return;
  }
  container.innerHTML = components
    .map(
      (c) => `
        <div class="card">
          <img src="${c.image || ""}">
          <div style="flex:1">
            <h3>${c.name}</h3>
            <div class="card-info">
              ${c.description ? `<p>${c.description}</p>` : ""}
              <p><b>Available:</b> ${c.stock > 0 ? c.stock : "Out of stock"}</p>
              ${c.rackNumber ? `<p><b>Rack:</b> ${c.rackNumber}</p>` : ""}
            </div>
          </div>
          <div class="card-actions">
            <button ${c.stock <= 0 ? "disabled" : ""} onclick="openTakeComponentModal(${c.productId}, '${(c.name || "").replace(/'/g, "\\'")}', '${c.rackNumber || ""}', ${c.stock})">
              Take Component
            </button>
          </div>
        </div>
      `,
    )
    .join("");
}

function filterComponents() {
  const query = (document.getElementById("customerSearchInput")?.value || "").toLowerCase().trim();
  if (!query) {
    renderComponentCards(allComponents);
    return;
  }
  const filtered = allComponents.filter(
    (c) =>
      (c.name || "").toLowerCase().includes(query) ||
      (c.description || "").toLowerCase().includes(query),
  );
  renderComponentCards(filtered);
}

function openTakeComponentModal(productId, name, rackNumber, stock) {
  currentTakeComponent = { productId, name, rackNumber, stock };
  document.getElementById("takeComponentTitle").innerText = `Take: ${name}`;
  document.getElementById("takeComponentRack").value = rackNumber || "N/A";
  document.getElementById("takeComponentDate").value = new Date().toLocaleDateString();
  document.getElementById("takeComponentName").value = "";
  document.getElementById("takeComponentProject").value = "";
  document.getElementById("takeComponentPurpose").value = "";
  document.getElementById("takeComponentQty").value = 1;
  document.getElementById("takeComponentError").innerText = "";
  document.getElementById("takeComponentModal").style.display = "flex";
}

function closeTakeComponentModal() {
  document.getElementById("takeComponentModal").style.display = "none";
}

async function submitTakeComponent() {
  const errBox = document.getElementById("takeComponentError");
  errBox.innerText = "";
  if (!currentTakeComponent) return;

  const name = document.getElementById("takeComponentName").value.trim();
  const projectName = document.getElementById("takeComponentProject").value.trim();
  const purpose = document.getElementById("takeComponentPurpose").value.trim();
  const quantity = Number(document.getElementById("takeComponentQty").value);

  try {
    const resp = await fetch(
      `${API_URL}/components/${currentTakeComponent.productId}/take`,
      {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ name, projectName, purpose, quantity }),
      },
    );
    const result = await resp.json();
    if (!resp.ok || !result.success) {
      errBox.innerText = result.message || "Could not take component.";
      return;
    }
    closeTakeComponentModal();
    await loadComponents();
    await loadMyTransactions();
  } catch (err) {
    console.error(err);
    errBox.innerText = "Server error. Please try again.";
  }
}

async function loadMyTransactions() {
  const container = document.getElementById("myTransactionsContainer");
  if (!container) return;
  container.innerHTML = "Loading...";
  try {
    const resp = await fetch(`${API_URL}/myTransactions`, { headers: authHeaders() });
    const data = await resp.json();
    if (!data.success || data.transactions.length === 0) {
      container.innerHTML = "<p>No transactions yet.</p>";
      return;
    }
    let html = `<table style="width:100%;border-collapse:collapse">
      <thead><tr>
        <th>Component</th><th>Qty</th><th>Project</th><th>Purpose</th>
        <th>Rack</th><th>Issue Date</th><th>Status</th>
      </tr></thead><tbody>`;
    data.transactions.forEach((t) => {
      html += `<tr data-tx="${t.transactionId}">
        <td>${t.componentName}</td>
        <td>${t.quantity}</td>
        <td>${t.projectName}</td>
        <td>${t.purpose}</td>
        <td>${t.rackNumber || ""}</td>
        <td>${new Date(t.issueDate).toLocaleDateString()}</td>
        <td>${
          t.status === "Issued"
            ? `<button onclick="returnMyTransaction(${t.transactionId})">Return Component</button>`
            : "Returned"
        }</td>
      </tr>`;
    });
    html += "</tbody></table>";
    container.innerHTML = html;
  } catch (err) {
    console.error(err);
    container.innerHTML = "<p>Error loading transactions.</p>";
  }
}

async function returnMyTransaction(transactionId) {
  // Step 1: Request OTP first — do not process return yet
  currentReturnTransactionId = transactionId;
  const otpModal = document.getElementById("otpModal");
  const otpInput = document.getElementById("otpInput");
  const otpError = document.getElementById("otpError");
  const otpMsg = document.getElementById("otpModalMessage");
  otpInput.value = "";
  otpError.textContent = "";
  otpMsg.textContent = "Sending OTP to chayas008@gmail.com...";
  otpModal.style.display = "flex";

  try {
    const resp = await fetch(`${API_URL}/transactions/${transactionId}/return/request-otp`, {
      method: "POST",
      headers: authHeaders(),
    });
    const result = await resp.json();
    if (!resp.ok || !result.success) {
      otpError.textContent = result.message || "Could not send OTP.";
      otpMsg.textContent = "";
      return;
    }
    otpMsg.textContent = "An OTP has been sent to chayas008@gmail.com. Check your inbox and enter it below to confirm the return.";
  } catch (err) {
    console.error(err);
    otpError.textContent = "Server error. Please try again.";
    otpMsg.textContent = "";
  }
}

// OTP state
let currentReturnTransactionId = null;

function closeOtpModal() {
  document.getElementById("otpModal").style.display = "none";
  currentReturnTransactionId = null;
}

async function resendOtp() {
  if (!currentReturnTransactionId) return;
  const otpError = document.getElementById("otpError");
  const otpMsg = document.getElementById("otpModalMessage");
  otpError.textContent = "";
  otpMsg.textContent = "Resending OTP…";
  document.getElementById("otpInput").value = "";
  try {
    const resp = await fetch(`${API_URL}/transactions/${currentReturnTransactionId}/return/request-otp`, {
      method: "POST",
      headers: authHeaders(),
    });
    const result = await resp.json();
    if (!resp.ok || !result.success) {
      otpError.textContent = result.message || "Could not resend OTP.";
      otpMsg.textContent = "";
    } else {
      otpMsg.textContent = "New OTP sent to chayas008@gmail.com. Check your inbox. Valid for 5 minutes.";
    }
  } catch (err) {
    console.error(err);
    otpError.textContent = "Server error. Please try again.";
    otpMsg.textContent = "";
  }
}

async function submitOtp() {
  if (!currentReturnTransactionId) return;
  const otp = document.getElementById("otpInput").value.trim();
  const otpError = document.getElementById("otpError");
  otpError.textContent = "";
  if (!otp || otp.length !== 6) {
    otpError.textContent = "Please enter the 6-digit OTP.";
    return;
  }
  try {
    const resp = await fetch(`${API_URL}/transactions/${currentReturnTransactionId}/return/verify-otp`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ otp }),
    });
    const result = await resp.json();
    if (!resp.ok || !result.success) {
      otpError.textContent = result.message || "Incorrect OTP. Please try again.";
      return;
    }
    // Success
    closeOtpModal();
    await loadMyTransactions();
    await loadComponents();
    alert("✅ Component returned successfully!");
  } catch (err) {
    console.error(err);
    otpError.textContent = "Server error. Please try again.";
  }
}

// ---------- Admin: Transactions page with search ----------
async function loadAdminTransactions() {
  const container = document.getElementById("adminTransactionsContainer");
  if (!container) return;
  container.innerHTML = "Loading...";
  try {
    const params = new URLSearchParams();
    const customerName = document.getElementById("txSearchCustomer")?.value.trim();
    const componentName = document.getElementById("txSearchComponent")?.value.trim();
    const projectName = document.getElementById("txSearchProject")?.value.trim();
    const status = document.getElementById("txSearchStatus")?.value;
    if (customerName) params.set("customerName", customerName);
    if (componentName) params.set("componentName", componentName);
    if (projectName) params.set("projectName", projectName);
    if (status) params.set("status", status);

    const resp = await fetch(`${API_URL}/admin/transactions?${params.toString()}`, {
      headers: authHeaders(),
    });
    const data = await resp.json();
    if (!data.success || data.transactions.length === 0) {
      container.innerHTML = "<p>No transactions found.</p>";
      return;
    }
    let html = `<table style="width:100%;border-collapse:collapse">
      <thead><tr>
        <th>Customer</th><th>Component</th><th>Qty</th><th>Project</th>
        <th>Purpose</th><th>Rack</th><th>Issue Date</th><th>Return Date</th><th>Status</th>
      </tr></thead><tbody>`;
    data.transactions.forEach((t) => {
      html += `<tr>
        <td>${t.customerName}</td>
        <td>${t.componentName}</td>
        <td>${t.quantity}</td>
        <td>${t.projectName}</td>
        <td>${t.purpose}</td>
        <td>${t.rackNumber || ""}</td>
        <td>${new Date(t.issueDate).toLocaleDateString()}</td>
        <td>${t.returnDate ? new Date(t.returnDate).toLocaleDateString() : ""}</td>
        <td>${t.status}</td>
      </tr>`;
    });
    html += "</tbody></table>";
    container.innerHTML = html;
  } catch (err) {
    console.error(err);
    container.innerHTML = "<p>Error loading transactions.</p>";
  }
}

function openAdminTransactionsModal() {
  document.getElementById("adminTransactionsModal").style.display = "flex";
  loadAdminTransactions();
}

function searchEmployeeHistory() {
  const search = document
    .getElementById("employeeHistorySearch")
    .value.toLowerCase()
    .trim();

  const cards = document.querySelectorAll(".history-card");

  cards.forEach((card) => {
    const employee = (card.dataset.employee || "").toLowerCase();

    if (search === "" || employee.includes(search)) {
      card.style.display = "";
    } else {
      card.style.display = "none";
    }
  });
}

checkRole();
loadProducts();
loadProjects();
loadWorkshops();
loadTesting();
loadIssueComponents();
toggleIssueFields();

function openDamagedPage() {
  window.location.href = "damaged-report.html";
}

/* =========================================================================
   GAP-FILL FEATURES: Stock Receiving, Reports (PDF/Excel), Audit Log,
   and extra dashboard cards. These call the new backend routes added in
   server.js and never touch the existing product/issue/return/exchange
   flows above.
   ========================================================================= */

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: "Bearer " + (localStorage.getItem("token") || ""),
  };
}

/* ---------- Extra dashboard cards ---------- */
async function loadDashboardExtras() {
  try {
    const res = await fetch(`${API_URL}/dashboard`, { headers: authHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    if (!data.success) return;

    let extra = document.getElementById("dashboardExtras");
    if (!extra) {
      extra = document.createElement("div");
      extra.id = "dashboardExtras";
      extra.className = "products";
      const dashboardEl = document.getElementById("dashboard");
      dashboardEl.parentNode.insertBefore(extra, dashboardEl.nextSibling);
    }

    extra.innerHTML = `
      <div class="card">
        <h3>Total Components</h3>
        <p>${data.totalComponents}</p>
      </div>
      <div class="card">
        <h3>Available Inventory</h3>
        <p>${data.availableInventory}</p>
      </div>
      <div class="card">
        <h3>Low Stock</h3>
        <p>${data.lowStock}</p>
      </div>
      <div class="card">
        <h3>Today's Usage</h3>
        <p>${data.todayUsage}</p>
      </div>
      <div class="card">
        <h3>Today's Stock Received</h3>
        <p>${data.todayStockReceived}</p>
      </div>
      <div class="card">
        <h3>Weekly Usage</h3>
        <p>${data.weeklyUsage}</p>
      </div>
      <div class="card">
        <h3>Weekly Replacement</h3>
        <p>${data.weeklyReplacement}</p>
      </div>
    `;

    if (String(role).toLowerCase() === "admin") {
      try {
        const summaryRes = await fetch(`${API_URL}/admin/summary`, {
          headers: authHeaders(),
        });
        if (summaryRes.ok) {
          const summary = await summaryRes.json();
          if (summary.success) {
            extra.innerHTML += `
              <div class="card">
                <h3>Components Issued</h3>
                <p>${summary.componentsIssued}</p>
              </div>
              <div class="card">
                <h3>Components Returned</h3>
                <p>${summary.componentsReturned}</p>
              </div>
              <div class="card">
                <h3>Total Transactions</h3>
                <p>${summary.totalTransactions}</p>
              </div>
            `;
          }
        }
      } catch (summaryErr) {
        console.error("Failed to load admin summary", summaryErr);
      }
    }
  } catch (err) {
    console.error("Failed to load dashboard extras", err);
  }
}

/* ---------- Stock Receiving ---------- */
async function openStockReceiveModal() {
  const modal = document.getElementById("stockReceiveModal");
  modal.style.display = "flex";

  const select = document.getElementById("receiveProduct");
  select.innerHTML = "";
  try {
    const res = await fetch(`${API_URL}/products`);
    const prods = await res.json();
    prods.forEach((p) => {
      select.innerHTML += `<option value="${p.productId}">${p.name}</option>`;
    });
  } catch (err) {
    console.error("Failed to load products for stock receiving", err);
  }

  document.getElementById("receiveDate").value = new Date()
    .toISOString()
    .slice(0, 10);
}

async function submitStockReceive() {
  const productId = document.getElementById("receiveProduct").value;
  const quantity = document.getElementById("receiveQty").value;
  const supplierName = document.getElementById("receiveSupplier").value;
  const invoiceNumber = document.getElementById("receiveInvoice").value;
  const receivedBy = document.getElementById("receiveBy").value;
  const date = document.getElementById("receiveDate").value;
  const remarks = document.getElementById("receiveRemarks").value;

  try {
    const res = await fetch(`${API_URL}/stock/receive`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        productId,
        quantity,
        supplierName,
        invoiceNumber,
        receivedBy,
        date,
        remarks,
      }),
    });
    const result = await res.json();
    alert(result.message);
    if (result.success) {
      document.getElementById("stockReceiveModal").style.display = "none";
      await loadProducts();
      await loadDashboardExtras();
    }
  } catch (err) {
    console.error("Failed to submit stock receipt", err);
    alert("Failed to receive stock. Please try again.");
  }
}

/* ---------- Reports ---------- */
function onReportPeriodChange() {
  const period = document.getElementById("reportPeriodType").value;
  document.getElementById("customReportRange").style.display =
    period === "custom" ? "block" : "none";
}

function buildReportQuery() {
  const periodType = document.getElementById("reportPeriodType").value;
  let query = `periodType=${periodType}`;
  if (periodType === "custom") {
    const start = document.getElementById("reportStartDate").value;
    const end = document.getElementById("reportEndDate").value;
    if (start) query += `&start=${start}`;
    if (end) query += `&end=${end}`;
  }
  return query;
}

async function downloadReportFile(format) {
  const query = buildReportQuery();
  const endpoint = format === "excel" ? "reports/excel" : "reports/pdf";
  try {
    const res = await fetch(`${API_URL}/${endpoint}?${query}`, {
      headers: authHeaders(),
    });
    if (!res.ok) {
      alert("Failed to generate report.");
      return;
    }
    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="?([^"]+)"?/);
    const fileName = match ? match[1] : `report.${format === "excel" ? "xlsx" : "pdf"}`;

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    console.error("Failed to download report", err);
    alert("Failed to download report.");
  }
}

async function loadOldReports() {
  const container = document.getElementById("oldReportsContainer");
  container.innerHTML = "Loading...";
  try {
    const res = await fetch(`${API_URL}/reports/list`, { headers: authHeaders() });
    const data = await res.json();
    if (!data.success || data.reports.length === 0) {
      container.innerHTML = "<p>No reports generated yet.</p>";
      return;
    }
    container.innerHTML = data.reports
      .map(
        (r) => `
        <div class="card" style="margin-bottom:8px">
          <p><b>${r.fileName}</b></p>
          <p>${r.reportType.toUpperCase()} (${r.format}) — generated by ${r.generatedBy}</p>
          <p>${new Date(r.createdAt).toLocaleString()}</p>
          <button onclick="downloadStoredReport('${r.fileName}')">
            Download
          </button>
        </div>
      `,
      )
      .join("");
  } catch (err) {
    console.error("Failed to load old reports", err);
    container.innerHTML = "<p>Failed to load reports.</p>";
  }
}

async function downloadStoredReport(fileName) {
  try {
    const res = await fetch(`${API_URL}/reports/download/${encodeURIComponent(fileName)}`, {
      headers: authHeaders(),
    });
    if (!res.ok) {
      alert("Failed to download report.");
      return;
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    console.error("Failed to download stored report", err);
    alert("Failed to download report.");
  }
}

function openReportsModal() {
  document.getElementById("reportsModal").style.display = "flex";
  loadOldReports();
}

/* ---------- Audit Log ---------- */
async function loadAuditLog() {
  const container = document.getElementById("auditLogContainer");
  container.innerHTML = "Loading...";
  try {
    const res = await fetch(`${API_URL}/audit?limit=200`, { headers: authHeaders() });
    const data = await res.json();
    if (!data.success || data.logs.length === 0) {
      container.innerHTML = "<p>No audit entries yet.</p>";
      return;
    }
    container.innerHTML = data.logs
      .map(
        (log) => `
        <div class="card" style="margin-bottom:8px">
          <p>${log.description}</p>
          <p style="opacity:0.7">${log.action} — ${log.actorEmail || "system"} — ${new Date(log.createdAt).toLocaleString()}</p>
        </div>
      `,
      )
      .join("");
  } catch (err) {
    console.error("Failed to load audit log", err);
    container.innerHTML = "<p>Failed to load audit log.</p>";
  }
}

function openAuditLogModal() {
  document.getElementById("auditLogModal").style.display = "flex";
  loadAuditLog();
}

// Load the extra dashboard cards once on startup (role-gated data is fine
// to fetch for employees too -- they just won't see the admin-only buttons)
loadDashboardExtras();

/* =========================================================================
   E-COMMERCE MODULE: Amazon / Flipkart stock-received, sold, return, and
   adjustment transactions. Fully separate view from the general inventory
   pages above -- only calls the new /ecommerce/* backend routes and never
   touches the existing product/issue/return data or DOM sections.
   ========================================================================= */

let ecomEditingTransactionId = null; // null = adding a new transaction

function openEcommercePage() {
  document.getElementById("dashboard").style.display = "none";
  const legacySection = document.getElementById("legacyAdminSection");
  if (legacySection) legacySection.style.display = "none";
  const componentsSection = document.getElementById("componentsSection");
  if (componentsSection) componentsSection.style.display = "none";
  const myTransactionsSection = document.getElementById("myTransactionsSection");
  if (myTransactionsSection) myTransactionsSection.style.display = "none";

  document.getElementById("ecommerceSection").style.display = "block";

  loadEcommerceSummary();
  loadEcommerceTransactions();
}

function closeEcommercePage() {
  document.getElementById("ecommerceSection").style.display = "none";
  document.getElementById("dashboard").style.display = "";
  checkRole();
}

async function loadEcommerceSummary() {
  const container = document.getElementById("ecommerceSummaryCards");
  if (!container) return;
  try {
    const res = await fetch(`${API_URL}/ecommerce/summary`, { headers: authHeaders() });
    const data = await res.json();
    if (!data.success) {
      container.innerHTML = "<p>Failed to load summary.</p>";
      return;
    }
    const s = data.summary;
    container.innerHTML = `
      <div class="card"><h3>Total Amazon Stock</h3><p>${s.totalAmazonStock}</p></div>
      <div class="card"><h3>Total Flipkart Stock</h3><p>${s.totalFlipkartStock}</p></div>
      <div class="card"><h3>Amazon Stock Received</h3><p>${s.amazonStockReceived}</p></div>
      <div class="card"><h3>Flipkart Stock Received</h3><p>${s.flipkartStockReceived}</p></div>
      <div class="card"><h3>Amazon Units Sold</h3><p>${s.amazonUnitsSold}</p></div>
      <div class="card"><h3>Flipkart Units Sold</h3><p>${s.flipkartUnitsSold}</p></div>
      <div class="card"><h3>Total E-Commerce Sales</h3><p>₹${Number(s.totalEcommerceSales).toLocaleString("en-IN")}</p></div>
    `;
  } catch (err) {
    console.error("Failed to load e-commerce summary", err);
    container.innerHTML = "<p>Failed to load summary.</p>";
  }
}

async function loadEcommerceTransactions() {
  const container = document.getElementById("ecommerceTransactionsContainer");
  if (!container) return;
  container.innerHTML = "Loading...";
  try {
    const params = new URLSearchParams();
    const platform = document.getElementById("ecomPlatformFilter")?.value;
    const transactionType = document.getElementById("ecomTypeFilter")?.value;
    const search = document.getElementById("ecomSearch")?.value.trim();
    if (platform) params.set("platform", platform);
    if (transactionType) params.set("transactionType", transactionType);
    if (search) params.set("search", search);

    const res = await fetch(`${API_URL}/ecommerce/transactions?${params.toString()}`, {
      headers: authHeaders(),
    });
    const data = await res.json();
    if (!data.success || data.transactions.length === 0) {
      container.innerHTML = "<p>No E-Commerce transactions found.</p>";
      return;
    }

    let html = `<table style="width:100%;border-collapse:collapse">
      <thead><tr>
        <th>Date</th><th>Platform</th><th>Type</th><th>Product</th><th>SKU</th>
        <th>Qty</th><th>Unit Price</th><th>Total Amount</th><th>Reference/Order ID</th><th>Actions</th>
      </tr></thead><tbody>`;
    data.transactions.forEach((t) => {
      html += `<tr>
        <td>${new Date(t.transactionDate).toLocaleDateString()}</td>
        <td>${t.platform}</td>
        <td>${t.transactionType}${t.transactionType === "Adjustment" && t.adjustmentDirection ? " (" + t.adjustmentDirection + ")" : ""}</td>
        <td>${t.productName}</td>
        <td>${t.sku}</td>
        <td>${t.quantity}</td>
        <td>₹${Number(t.unitPrice).toLocaleString("en-IN")}</td>
        <td>₹${Number(t.totalAmount).toLocaleString("en-IN")}</td>
        <td>${t.referenceNumber || ""}</td>
        <td>
          <button onclick="openEcommerceTransactionModal(${t.transactionId})">Edit</button>
          <button onclick="deleteEcommerceTransaction(${t.transactionId})">Delete</button>
        </td>
      </tr>`;
    });
    html += "</tbody></table>";
    container.innerHTML = html;
  } catch (err) {
    console.error("Failed to load e-commerce transactions", err);
    container.innerHTML = "<p>Error loading transactions.</p>";
  }
}
async function downloadEcommerceExcel() {
  try {
    const params = new URLSearchParams();
    const platform = document.getElementById("ecomPlatformFilter")?.value;
    const transactionType = document.getElementById("ecomTypeFilter")?.value;
    const search = document.getElementById("ecomSearch")?.value.trim();
    if (platform) params.set("platform", platform);
    if (transactionType) params.set("transactionType", transactionType);
    if (search) params.set("search", search);

    const res = await fetch(`${API_URL}/ecommerce/transactions/export?${params.toString()}`, {
      headers: authHeaders(),
    });
    if (!res.ok) {
      alert("Failed to download Excel file.");
      return;
    }
    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="?([^"]+)"?/);
    const fileName = match ? match[1] : "Ecommerce_Transactions.xlsx";

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    console.error("Failed to download e-commerce Excel", err);
    alert("Failed to download Excel file.");
  }
}
function onEcomTxTypeChange() {
  const type = document.getElementById("ecomTxType").value;
  document.getElementById("ecomAdjustmentDirectionContainer").style.display =
    type === "Adjustment" ? "block" : "none";
  document.getElementById("ecomUnitPriceLabel").textContent =
    type === "Sold" ? "Selling Price (per unit)" : "Purchase/Stock Cost (per unit)";
  document.getElementById("ecomRefLabel").textContent =
    type === "Sold" ? "Order ID / Invoice Number" : "Invoice/Reference Number";
}

function onEcomTxProductChange() {
  const select = document.getElementById("ecomTxProduct");
  const skuInput = document.getElementById("ecomTxSku");
  if (select.value && !skuInput.value) {
    skuInput.placeholder = `Defaults to ${select.value}`;
  }
}

async function openEcommerceTransactionModal(transactionId) {
  ecomEditingTransactionId = transactionId || null;
  document.getElementById("ecomModalTitle").textContent = ecomEditingTransactionId
    ? "Edit E-Commerce Transaction"
    : "Add E-Commerce Transaction";

  const productSelect = document.getElementById("ecomTxProduct");
  productSelect.innerHTML = "";
  try {
    const res = await fetch(`${API_URL}/products`);
    const prods = await res.json();
    prods.forEach((p) => {
      productSelect.innerHTML += `<option value="${p.productId}">${p.name}</option>`;
    });
  } catch (err) {
    console.error("Failed to load products for e-commerce transaction", err);
  }

  // Reset fields
  document.getElementById("ecomTxPlatform").value = "Amazon";
  document.getElementById("ecomTxType").value = "Stock Received";
  document.getElementById("ecomTxAdjustmentDirection").value = "increase";
  document.getElementById("ecomTxSku").value = "";
  document.getElementById("ecomTxQty").value = "";
  document.getElementById("ecomTxUnitPrice").value = "";
  document.getElementById("ecomTxRef").value = "";
  document.getElementById("ecomTxNotes").value = "";
  document.getElementById("ecomTxDate").value = new Date().toISOString().slice(0, 10);

  if (ecomEditingTransactionId) {
    try {
      const res = await fetch(`${API_URL}/ecommerce/transactions`, { headers: authHeaders() });
      const data = await res.json();
      const tx = data.transactions?.find((t) => t.transactionId === ecomEditingTransactionId);
      if (tx) {
        document.getElementById("ecomTxPlatform").value = tx.platform;
        document.getElementById("ecomTxType").value = tx.transactionType;
        document.getElementById("ecomTxProduct").value = tx.productId;
        document.getElementById("ecomTxSku").value = tx.sku;
        document.getElementById("ecomTxQty").value = tx.quantity;
        document.getElementById("ecomTxAdjustmentDirection").value = tx.adjustmentDirection || "increase";
        document.getElementById("ecomTxUnitPrice").value = tx.unitPrice;
        document.getElementById("ecomTxRef").value = tx.referenceNumber || "";
        document.getElementById("ecomTxNotes").value = tx.notes || "";
        document.getElementById("ecomTxDate").value = new Date(tx.transactionDate).toISOString().slice(0, 10);
      }
    } catch (err) {
      console.error("Failed to load transaction for editing", err);
    }
  }

  onEcomTxTypeChange();
  document.getElementById("ecommerceTransactionModal").style.display = "flex";
}

function closeEcommerceTransactionModal() {
  document.getElementById("ecommerceTransactionModal").style.display = "none";
  ecomEditingTransactionId = null;
}

async function submitEcommerceTransaction() {
  const payload = {
    platform: document.getElementById("ecomTxPlatform").value,
    transactionType: document.getElementById("ecomTxType").value,
    productId: document.getElementById("ecomTxProduct").value,
    sku: document.getElementById("ecomTxSku").value,
    quantity: document.getElementById("ecomTxQty").value,
    adjustmentDirection: document.getElementById("ecomTxAdjustmentDirection").value,
    unitPrice: document.getElementById("ecomTxUnitPrice").value,
    referenceNumber: document.getElementById("ecomTxRef").value,
    date: document.getElementById("ecomTxDate").value,
    notes: document.getElementById("ecomTxNotes").value,
  };

  try {
    const url = ecomEditingTransactionId
      ? `${API_URL}/ecommerce/transactions/${ecomEditingTransactionId}`
      : `${API_URL}/ecommerce/transactions`;
    const method = ecomEditingTransactionId ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(payload) });
    const result = await res.json();
    alert(result.message);
    if (result.success) {
      closeEcommerceTransactionModal();
      await loadEcommerceSummary();
      await loadEcommerceTransactions();
      await loadProducts();
    }
  } catch (err) {
    console.error("Failed to save e-commerce transaction", err);
    alert("Failed to save transaction. Please try again.");
  }
}

async function deleteEcommerceTransaction(transactionId) {
  if (!confirm("Delete this E-Commerce transaction? This cannot be undone.")) return;
  try {
    const res = await fetch(`${API_URL}/ecommerce/transactions/${transactionId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    const result = await res.json();
    alert(result.message);
    if (result.success) {
      await loadEcommerceSummary();
      await loadEcommerceTransactions();
      await loadProducts();
    }
  } catch (err) {
    console.error("Failed to delete e-commerce transaction", err);
    alert("Failed to delete transaction. Please try again.");
  }
}
