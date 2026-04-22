/**
 * composer.js — Lifecycle Composer
 *
 * - One row per Archive Request
 * - When saved: row collapses to a "Saved" state with Clone and View Definition buttons
 * - Clone: creates a fresh editable row with the same AR, allowing different name/IR/DR
 * - Saves to YAML via POST /api/v1/lifecycle/compose
 * - Reads saved definitions from GET /api/v1/lifecycle/definitions
 */

// ─── Mock fallback ────────────────────────────────────────────────────────────
const MOCK = {
  ARCHIVE: [
    { obj_id: "PSTDEMO", obj_name: "AR_W_LOCALAD", description: "AR With LOCAL AD" },
    { obj_id: "PSTDEMO", obj_name: "SAMPLE_AR",    description: "Archive for Sample Data - Oracle DB" },
  ],
  INSERT: [
    { obj_id: "PSTDEMO", obj_name: "NAMED_IR",  description: "SAMPLE IR with Named TM" },
    { obj_id: "PSTDEMO", obj_name: "SAMPLE_IR", description: "Insert Request Sample" },
  ],
  DELETE: [
    { obj_id: "PSTDEMO", obj_name: "CRTL_FILE_D", description: "Test Delete Control File" },
    { obj_id: "PSTDEMO", obj_name: "SAMPLE_DR",   description: "Test Delete" },
  ],
};

let archives = [];
let inserts  = [];
let deletes  = [];

// saved[arFullName] = array of saved lifecycle IDs using that AR
// Used to decide which rows to show as "saved" vs "fresh"
let savedByAr = {};

// ─── Fetch helpers ────────────────────────────────────────────────────────────
async function fetchType(type) {
  try {
    const res = await fetch(`/api/v1/requests/${type}`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    return data.map(d => ({
      obj_id:      d.obj_id || d.name?.split(".")?.[0] || "",
      obj_name:    d.obj_name || d.name?.split(".")?.[1] || d.name || "",
      description: d.description || "",
    }));
  } catch {
    return MOCK[type] || [];
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
    return false;
  }
}

async function loadSaved() {
  try {
    const res = await fetch("/api/v1/lifecycle/definitions");
    if (!res.ok) throw new Error();
    return await res.json();
  } catch {
    return [];
  }
}

async function nextId(existing) {
  const nums = existing
    .map(lc => parseInt((lc.id || "LF00").replace("LF", ""), 10))
    .filter(n => !isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return `LF${String(max + 1).padStart(2, "0")}`;
}

// ─── Dropdown HTML ────────────────────────────────────────────────────────────
function selectHtml(items, cssClass, selectId) {
  const opts = items.map(item => {
    const fullName = `${item.obj_id}.${item.obj_name}`;
    const label    = item.obj_name + (item.description ? ` — ${item.description}` : "");
    return `<option value="${fullName}">${label}</option>`;
  }).join("");
  return `<select class="op-select ${cssClass}" id="${selectId}">${opts}</select>`;
}

// ─── Render table ─────────────────────────────────────────────────────────────
function renderTable(saved) {
  const tbody = document.getElementById("composer-body");
  if (!archives.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="loading-cell">No archive requests found in Optim catalog.</td></tr>`;
    return;
  }

  // Build set of saved AR names (first occurrence only — allow cloning)
  // Each AR gets one fresh row. Saved rows are collapsed.
  // Rows are keyed by rowKey = `${arFullName}-${rowIndex}`
  const rows = getDisplayRows(saved);

  tbody.innerHTML = rows.map((row, idx) => renderRow(row, idx)).join("");
  wireRowEvents();
}

function getDisplayRows(saved) {
  // Start with one row per archive. For each saved entry, record it.
  // Extra rows come from cloning.
  const baseRows = archives.map(ar => ({
    ar,
    arFullName: `${ar.obj_id}.${ar.obj_name}`,
    savedAs:    null,
    rowKey:     `${ar.obj_id}.${ar.obj_name}-0`,
  }));

  // Mark base rows that have been saved
  saved.forEach(lc => {
    const arName = lc.archive_request;
    const base = baseRows.find(r => r.arFullName === arName && !r.savedAs);
    if (base) base.savedAs = lc;
  });

  return baseRows;
}

function renderRow(row, idx) {
  const { ar, arFullName, savedAs } = row;

  if (savedAs) {
    // Collapsed saved row
    return `
      <tr data-idx="${idx}" data-ar="${arFullName}" class="row-saved">
        <td>
          <div class="saved-inline">
            <span class="saved-inline-id">${savedAs.id}</span>
            <span class="saved-inline-name">${savedAs.name}</span>
            <span class="saved-inline-badge">✓ Saved</span>
          </div>
        </td>
        <td>
          <div class="ar-cell">
            <div class="ar-name">${arFullName}</div>
            ${ar.description ? `<div class="ar-desc">${ar.description}</div>` : ""}
          </div>
        </td>
        <td class="saved-op-cell"><span class="saved-op-pill pill-ir">${savedAs.insert_request?.split(".")?.[1] || savedAs.insert_request}</span></td>
        <td class="saved-op-cell"><span class="saved-op-pill pill-dr">${savedAs.delete_request?.split(".")?.[1] || savedAs.delete_request}</span></td>
        <td class="col-rule">
          <span style="font-size:10px;color:${savedAs.insert_before_delete ? "#7c3aed" : "#94a3b8"}">
            ${savedAs.insert_before_delete ? "ON" : "OFF"}
          </span>
        </td>
        <td class="col-action" style="display:flex;gap:6px;justify-content:flex-end;">
          <a class="btn-view-small" href="defn.html?id=${savedAs.id}" target="_blank">View</a>
          <button class="btn-clone" data-ar="${arFullName}" data-idx="${idx}">Clone</button>
        </td>
      </tr>
    `;
  }

  // Fresh editable row
  return `
    <tr data-idx="${idx}" data-ar="${arFullName}" class="row-fresh">
      <td>
        <input type="text" class="lc-name-input" id="lc-name-${idx}"
          placeholder="e.g. Customer Archive Q1" />
      </td>
      <td>
        <div class="ar-cell">
          <div class="ar-name">${arFullName}</div>
          ${ar.description ? `<div class="ar-desc">${ar.description}</div>` : ""}
        </div>
      </td>
      <td>${selectHtml(inserts, "ir-select", `ir-sel-${idx}`)}</td>
      <td>${selectHtml(deletes, "dr-select", `dr-sel-${idx}`)}</td>
      <td class="col-rule">
        <div class="rule-toggle-wrap">
          <label class="rule-toggle">
            <input type="checkbox" class="delete-rule-chk" id="rule-${idx}" />
            <span class="rule-slider"></span>
          </label>
          <span class="rule-label" id="rule-label-${idx}">OFF</span>
        </div>
      </td>
      <td class="col-action">
        <button class="btn-save" id="btn-save-${idx}" data-idx="${idx}" disabled>Save</button>
      </td>
    </tr>
  `;
}

function wireRowEvents() {
  // Delete rule toggles
  document.querySelectorAll(".delete-rule-chk").forEach(chk => {
    const row  = chk.closest("tr");
    const idx  = row?.dataset.idx;
    const label = idx ? document.getElementById(`rule-label-${idx}`) : null;
    chk.addEventListener("change", () => {
      if (label) { label.textContent = chk.checked ? "ON" : "OFF"; label.className = chk.checked ? "rule-label active" : "rule-label"; }
    });
  });

  // Name inputs enable save button
  document.querySelectorAll(".lc-name-input").forEach(input => {
    const row = input.closest("tr");
    const idx = row?.dataset.idx;
    const btn = idx ? document.getElementById(`btn-save-${idx}`) : null;
    input.addEventListener("input", () => {
      if (btn) btn.disabled = input.value.trim() === "";
    });
  });

  // Save buttons
  document.querySelectorAll(".btn-save[data-idx]").forEach(btn => {
    btn.addEventListener("click", () => handleSave(parseInt(btn.dataset.idx, 10)));
  });

  // Clone buttons
  document.querySelectorAll(".btn-clone[data-ar]").forEach(btn => {
    btn.addEventListener("click", () => handleClone(btn.dataset.ar, btn.dataset.idx));
  });
}

// ─── Save ─────────────────────────────────────────────────────────────────────
async function handleSave(idx) {
  const row     = document.querySelector(`tr[data-idx="${idx}"]`);
  const nameEl  = document.getElementById(`lc-name-${idx}`);
  const irEl    = document.getElementById(`ir-sel-${idx}`);
  const drEl    = document.getElementById(`dr-sel-${idx}`);
  const ruleEl  = document.getElementById(`rule-${idx}`);
  const saveBtn = document.getElementById(`btn-save-${idx}`);
  const arName  = row?.dataset.ar;

  if (!nameEl || !nameEl.value.trim()) { showToast("Please enter a lifecycle name.", "error"); return; }

  const existing = await loadSaved();
  const lcId     = await nextId(existing);

  const lifecycle = {
    id:                   lcId,
    name:                 nameEl.value.trim(),
    description:          `Lifecycle: ${arName?.split(".")?.[1] || arName}`,
    archive_request:      arName,
    insert_request:       irEl?.value || "",
    delete_request:       drEl?.value || "",
    insert_before_delete: ruleEl?.checked || false,
    parameter_file:       `C:\\cryonix\\params\\${lcId.toLowerCase()}_param.txt`,
    reports_directory:    `C:\\optim_reports\\${lcId.toLowerCase()}`,
  };

  await saveToApi(lifecycle);
  showToast(`"${lifecycle.name}" saved as ${lcId}`, "success");
  await refresh();
}

// ─── Clone ────────────────────────────────────────────────────────────────────
async function handleClone(arFullName, idx) {
  // Insert a fresh editable row immediately after the saved row
  const savedRow = document.querySelector(`tr[data-idx="${idx}"]`);
  if (!savedRow) return;

  const ar = archives.find(a => `${a.obj_id}.${a.obj_name}` === arFullName);
  if (!ar) return;

  const cloneIdx = `clone-${Date.now()}`;
  const cloneHtml = renderRow({ ar, arFullName, savedAs: null }, cloneIdx);

  const tempDiv = document.createElement("tbody");
  tempDiv.innerHTML = cloneHtml;
  const newRow = tempDiv.firstElementChild;
  newRow.dataset.idx = cloneIdx;
  newRow.classList.add("row-clone");

  savedRow.after(newRow);
  wireRowEvents();
  newRow.querySelector(".lc-name-input")?.focus();
  showToast("Row cloned — give it a new name and save.", "");
}

// ─── Saved list ───────────────────────────────────────────────────────────────
async function renderSavedList(saved) {
  const container = document.getElementById("saved-list");
  const countEl   = document.getElementById("saved-count");
  countEl.textContent = `${saved.length} lifecycle${saved.length !== 1 ? "s" : ""}`;

  if (!saved.length) {
    container.innerHTML = `<div class="saved-empty">No lifecycle definitions saved yet.</div>`;
    return;
  }

  container.innerHTML = saved.map(lc => `
    <div class="saved-card">
      <div class="saved-card-id">${lc.id || "—"}</div>
      <div style="flex:1">
        <div class="saved-card-name">${lc.name}</div>
        <div style="font-size:11px;color:#94a3b8;margin-top:2px;">${lc.description || ""}</div>
      </div>
      <div class="saved-card-ops">
        <span class="saved-op-pill pill-ar">AR: ${lc.archive_request?.split(".")?.[1] || lc.archive_request}</span>
        <span class="saved-op-pill pill-ir">IR: ${lc.insert_request?.split(".")?.[1] || lc.insert_request}</span>
        <span class="saved-op-pill pill-dr">DR: ${lc.delete_request?.split(".")?.[1] || lc.delete_request}</span>
      </div>
      ${lc.insert_before_delete ? `<span class="saved-card-rule">Insert → Delete</span>` : ""}
      <div class="saved-card-actions">
        <a class="btn-view-defn" href="defn.html?id=${lc.id}" target="_blank">View Definition</a>
      </div>
    </div>
  `).join("");
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(msg, type = "") {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.className = `toast show${type ? " " + type : ""}`;
  setTimeout(() => { toast.className = "toast"; }, 3000);
}

// ─── Refresh ──────────────────────────────────────────────────────────────────
async function refresh() {
  const saved = await loadSaved();
  renderTable(saved);
  renderSavedList(saved);
}

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  [archives, inserts, deletes] = await Promise.all([
    fetchType("ARCHIVE"),
    fetchType("INSERT"),
    fetchType("DELETE"),
  ]);
  await refresh();
}

init();
