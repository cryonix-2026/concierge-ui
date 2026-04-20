/**
 * composer.js
 *
 * Lifecycle Composer — pairs Archive Requests with Insert and Delete operations.
 *
 * Data sources:
 *   GET /api/v1/objects?type=V  → archive requests
 *   GET /api/v1/objects?type=I  → insert requests
 *   GET /api/v1/objects?type=D  → delete requests
 *   POST /api/v1/lifecycle/compose → save a lifecycle definition
 *
 * Falls back to embedded mock data if API is unavailable (demo mode).
 */

// ─── Mock data (mirrors what MetadataService produces) ───────────────────────
const MOCK_ARCHIVES = [
  { obj_id: "PSTDEMO", obj_name: "AR_W_LOCALAD", description: "AR With LOCAL AD",               last_updated: "2026-04-13", modified_by: "schag" },
  { obj_id: "PSTDEMO", obj_name: "SAMPLE_AR",    description: "Archive for Sample Data - Oracle DB", last_updated: "2026-04-13", modified_by: "schag" },
];
const MOCK_INSERTS = [
  { obj_id: "PSTDEMO", obj_name: "NAMED_IR",  description: "SAMPLE IR with Named TM", last_updated: "2026-04-19", modified_by: "schag" },
  { obj_id: "PSTDEMO", obj_name: "SAMPLE_IR", description: "Insert Request Sample",   last_updated: "2026-04-19", modified_by: "schag" },
];
const MOCK_DELETES = [
  { obj_id: "PSTDEMO", obj_name: "CRTL_FILE_D", description: "Test Delete Control File", last_updated: "2026-04-19", modified_by: "schag" },
  { obj_id: "PSTDEMO", obj_name: "SAMPLE_DR",   description: "Test Delete",              last_updated: "2026-04-19", modified_by: "schag" },
];

// ─── State ────────────────────────────────────────────────────────────────────
let archives = [];
let inserts  = [];
let deletes  = [];
let savedLifecycles = loadSaved();

// ─── API helpers ──────────────────────────────────────────────────────────────
async function fetchObjects(type) {
  try {
    const res = await fetch(`/api/v1/objects?type=${type}`);
    if (!res.ok) throw new Error("API unavailable");
    return await res.json();
  } catch {
    // Demo fallback
    if (type === "V") return MOCK_ARCHIVES;
    if (type === "I") return MOCK_INSERTS;
    if (type === "D") return MOCK_DELETES;
    return [];
  }
}

async function saveToApi(lifecycle) {
  try {
    const res = await fetch("/api/v1/lifecycle/compose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lifecycle),
    });
    return res.ok;
  } catch {
    return false; // Demo mode — save locally only
  }
}

// ─── Local persistence (demo) ─────────────────────────────────────────────────
function loadSaved() {
  try {
    return JSON.parse(localStorage.getItem("cryonix_lifecycles") || "[]");
  } catch { return []; }
}
function persistSaved() {
  localStorage.setItem("cryonix_lifecycles", JSON.stringify(savedLifecycles));
}
function nextLifecycleId() {
  if (savedLifecycles.length === 0) return "LF01";
  const nums = savedLifecycles
    .map(lc => parseInt((lc.lifecycle_id || "LF00").replace("LF", ""), 10))
    .filter(n => !isNaN(n));
  const max = Math.max(0, ...nums);
  return `LF${String(max + 1).padStart(2, "0")}`;
}

// ─── Dropdown builder ─────────────────────────────────────────────────────────
function buildDropdown(items, cssClass, selectedName = "") {
  const opts = items.map(item => {
    const fullName = `${item.obj_id}.${item.obj_name}`;
    const selected = fullName === selectedName ? " selected" : "";
    return `<option value="${fullName}" title="${item.description}"${selected}>
      ${item.obj_name}
    </option>`;
  }).join("");
  return `<select class="op-select ${cssClass}">${opts}</select>`;
}

// ─── Step order indicator ─────────────────────────────────────────────────────
function stepOrderHtml(deleteRule) {
  if (deleteRule) {
    // Insert must complete before Delete
    return `
      <div class="step-order">
        <span class="step-pill ar">Archive</span>
        <span class="step-arrow">→</span>
        <span class="step-pill ir">Insert</span>
        <span class="step-arrow">→</span>
        <span class="step-pill dr">Delete</span>
        <span class="step-arrow">→</span>
        <span class="step-pill val">Validate</span>
      </div>`;
  }
  return `
    <div class="step-order">
      <span class="step-pill ar">Archive</span>
      <span class="step-arrow">→</span>
      <span class="step-pill ir">Insert</span>
      <span class="step-arrow">/</span>
      <span class="step-pill dr">Delete</span>
      <span class="step-arrow">→</span>
      <span class="step-pill val">Validate</span>
    </div>`;
}

// ─── Render composer table ────────────────────────────────────────────────────
function renderComposerTable() {
  const tbody = document.getElementById("composer-body");

  if (archives.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="loading-cell">No archive requests found in Optim catalog.</td></tr>`;
    return;
  }

  tbody.innerHTML = archives.map((ar, idx) => {
    const arFullName = `${ar.obj_id}.${ar.obj_name}`;
    return `
      <tr data-idx="${idx}">
        <td>
          <input
            type="text"
            class="lc-name-input"
            placeholder="e.g. Customer Archive Q1"
            data-ar="${arFullName}"
            id="lc-name-${idx}"
          />
        </td>

        <td>
          <div class="ar-cell">
            <div class="ar-name">${arFullName}</div>
            <div class="ar-desc">${ar.description || ""}</div>
            <div id="step-order-${idx}">${stepOrderHtml(false)}</div>
          </div>
        </td>

        <td>
          ${buildDropdown(inserts, "ir-select", "", )}
        </td>

        <td>
          ${buildDropdown(deletes, "dr-select", "")}
        </td>

        <td class="col-rule">
          <div class="rule-toggle-wrap">
            <label class="rule-toggle" title="When enabled: Delete only proceeds after Insert completes">
              <input type="checkbox" class="delete-rule-chk" data-idx="${idx}" />
              <span class="rule-slider"></span>
            </label>
            <span class="rule-label" id="rule-label-${idx}">OFF</span>
            <div class="rule-hint" id="rule-hint-${idx}">Independent</div>
          </div>
        </td>

        <td class="col-action">
          <button class="btn-save" data-idx="${idx}" id="btn-save-${idx}">
            Save
          </button>
        </td>
      </tr>
    `;
  }).join("");

  // Wire up delete rule toggles
  document.querySelectorAll(".delete-rule-chk").forEach(chk => {
    chk.addEventListener("change", (e) => {
      const idx = e.target.dataset.idx;
      const checked = e.target.checked;
      const label = document.getElementById(`rule-label-${idx}`);
      const hint  = document.getElementById(`rule-hint-${idx}`);
      const order = document.getElementById(`step-order-${idx}`);

      label.textContent = checked ? "ON" : "OFF";
      label.className   = checked ? "rule-label active" : "rule-label";
      hint.textContent  = checked ? "Insert → Delete" : "Independent";
      hint.className    = checked ? "rule-hint active" : "rule-hint";
      order.innerHTML   = stepOrderHtml(checked);
    });
  });

  // Wire up save buttons
  document.querySelectorAll(".btn-save").forEach(btn => {
    btn.addEventListener("click", (e) => {
      handleSave(parseInt(e.target.dataset.idx, 10));
    });
  });

  // Enable/disable save based on name input
  document.querySelectorAll(".lc-name-input").forEach(input => {
    input.addEventListener("input", (e) => {
      const idx = archives.indexOf(
        archives.find(a => `${a.obj_id}.${a.obj_name}` === e.target.dataset.ar)
      );
      const btn = document.getElementById(`btn-save-${idx}`);
      if (btn) btn.disabled = e.target.value.trim() === "";
    });
  });

  // Initially disable all save buttons until name is entered
  document.querySelectorAll(".btn-save").forEach(btn => { btn.disabled = true; });
}

// ─── Handle save ──────────────────────────────────────────────────────────────
async function handleSave(idx) {
  const ar = archives[idx];
  const row = document.querySelector(`tr[data-idx="${idx}"]`);

  const nameInput  = document.getElementById(`lc-name-${idx}`);
  const irSelect   = row.querySelectorAll(".ir-select")[0];
  const drSelect   = row.querySelectorAll(".dr-select")[0];
  const ruleChk    = row.querySelector(".delete-rule-chk");
  const saveBtn    = document.getElementById(`btn-save-${idx}`);

  const lcName    = nameInput.value.trim();
  const irName    = irSelect.value;
  const drName    = drSelect.value;
  const deleteRule = ruleChk.checked;

  if (!lcName) {
    showToast("Please enter a lifecycle name.", "error");
    nameInput.focus();
    return;
  }

  // Check for duplicate lifecycle names
  if (savedLifecycles.some(lc => lc.lifecycle_name.toLowerCase() === lcName.toLowerCase())) {
    showToast("A lifecycle with that name already exists.", "error");
    return;
  }

  const arObj = archives[idx];
  const irObj = inserts.find(i => `${i.obj_id}.${i.obj_name}` === irName);
  const drObj = deletes.find(d => `${d.obj_id}.${d.obj_name}` === drName);

  const lifecycle = {
    lifecycle_id:   nextLifecycleId(),
    lifecycle_name: lcName,
    description:    `Lifecycle: ${ar.obj_name} → ${irObj?.obj_name || irName} → ${drObj?.obj_name || drName}`,
    delete_rule:    deleteRule,
    step_order:     deleteRule
      ? ["archive", "insert", "delete", "validate"]
      : ["archive", "insert", "delete", "validate"],
    created_at:     new Date().toISOString(),
    archive_request: {
      obj_id:      arObj.obj_id,
      obj_name:    arObj.obj_name,
      description: arObj.description,
    },
    insert_request: {
      obj_id:      irObj?.obj_id || "",
      obj_name:    irObj?.obj_name || irName,
      description: irObj?.description || "",
    },
    delete_request: {
      obj_id:      drObj?.obj_id || "",
      obj_name:    drObj?.obj_name || drName,
      description: drObj?.description || "",
    },
  };

  // Try API save, fall back to local
  const apiOk = await saveToApi(lifecycle);
  savedLifecycles.push(lifecycle);
  persistSaved();

  // Update UI
  saveBtn.textContent = "✓ Saved";
  saveBtn.className = "btn-save saved";
  saveBtn.disabled = true;
  nameInput.disabled = true;
  irSelect.disabled = true;
  drSelect.disabled = true;
  ruleChk.disabled = true;

  showToast(`"${lcName}" saved as ${lifecycle.lifecycle_id}`, "success");
  renderSavedList();
}

// ─── Render saved lifecycles ──────────────────────────────────────────────────
function renderSavedList() {
  const container = document.getElementById("saved-list");
  const countEl   = document.getElementById("saved-count");

  countEl.textContent = `${savedLifecycles.length} lifecycle${savedLifecycles.length !== 1 ? "s" : ""}`;

  if (savedLifecycles.length === 0) {
    container.innerHTML = `<div class="saved-empty">No lifecycle definitions saved yet.</div>`;
    return;
  }

  container.innerHTML = savedLifecycles.map((lc, idx) => `
    <div class="saved-card">
      <div class="saved-card-id">${lc.lifecycle_id}</div>
      <div>
        <div class="saved-card-name">${lc.lifecycle_name}</div>
        <div style="font-size:11px; color:#94a3b8; margin-top:2px;">${lc.description}</div>
      </div>
      <div class="saved-card-ops">
        <span class="saved-op-pill pill-ar" title="${lc.archive_request.obj_name}">
          AR: ${lc.archive_request.obj_name}
        </span>
        <span class="saved-op-pill pill-ir" title="${lc.insert_request.obj_name}">
          IR: ${lc.insert_request.obj_name}
        </span>
        <span class="saved-op-pill pill-dr" title="${lc.delete_request.obj_name}">
          DR: ${lc.delete_request.obj_name}
        </span>
      </div>
      ${lc.delete_rule
        ? `<span class="saved-card-rule">Insert → Delete enforced</span>`
        : ""}
      <div class="saved-card-actions">
        <a class="btn-view-defn"
           href="defn.html?id=${lc.lifecycle_id}"
           target="_blank">
          View Definition
        </a>
        <button class="btn-delete-saved" data-idx="${idx}">Remove</button>
      </div>
    </div>
  `).join("");

  // Wire remove buttons
  container.querySelectorAll(".btn-delete-saved").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const i = parseInt(e.target.dataset.idx, 10);
      const name = savedLifecycles[i].lifecycle_name;
      savedLifecycles.splice(i, 1);
      persistSaved();
      renderComposerTable();
      renderSavedList();
      showToast(`"${name}" removed.`);
    });
  });
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(msg, type = "") {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.className = `toast show${type ? " " + type : ""}`;
  setTimeout(() => { toast.className = "toast"; }, 3000);
}

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  [archives, inserts, deletes] = await Promise.all([
    fetchObjects("V"),
    fetchObjects("I"),
    fetchObjects("D"),
  ]);
  renderComposerTable();
  renderSavedList();
}

init();
