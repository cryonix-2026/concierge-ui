/**
 * history.js — Execution History Page
 *
 * Fetches: GET /api/v1/lifecycle/history?lifecycle_id=<id>
 * Exports: filtered CSV of completed runs
 */

const urlParams    = new URLSearchParams(window.location.search);
const LIFECYCLE_ID = urlParams.get("id") || "";

let allRuns     = [];
let filteredId  = LIFECYCLE_ID;
let allIds      = [];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function el(id) { return document.getElementById(id); }
function show(id) { const e = el(id); if(e) e.style.display = ""; }
function hide(id) { const e = el(id); if(e) e.style.display = "none"; }

function fmtTs(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  if (isNaN(d)) return { date: ts, time: "" };
  return {
    date: d.toLocaleDateString("en-US", {month:"short",day:"numeric",year:"numeric"}),
    time: d.toLocaleTimeString("en-US", {hour:"2-digit",minute:"2-digit",second:"2-digit"}),
  };
}

function tsCell(ts) {
  if (!ts) return `<span class="report-none">—</span>`;
  const f = fmtTs(ts);
  return `<div class="ts-cell"><div class="ts-date">${f.date}</div><div class="ts-time">${f.time}</div></div>`;
}

function reportCell(stepData, stepClass, stepLabel) {
  if (!stepData) return `<span class="report-none">—</span>`;
  const report = stepData.report_path;
  const params = stepData.parameters;
  const status = stepData.status;

  let html = `<span class="step-pill ${stepClass}">${stepLabel}</span> `;

  if (report) {
    const filename = report.split("\\").pop().split("/").pop();
    html += `<a class="report-link" href="#" onclick="openReport(event,'${encodeURIComponent(report)}')">${filename}</a>`;
  } else if (status === "in_progress") {
    html += `<span style="font-size:11px;color:#2563eb;">In progress…</span>`;
  } else {
    html += `<span class="report-none">No report</span>`;
  }

  if (params) {
    html += `<div class="params-cell">${params.replace(/\|/g, " · ")}</div>`;
  }

  return html;
}

function statusBadge(status) {
  const label = {
    completed:         "Completed",
    in_progress:       "In Progress",
    failed:            "Failed",
    closed_incomplete: "Incomplete",
    pending:           "Pending",
  }[status] || status;
  return `<span class="status-badge ${status || "pending"}">${label}</span>`;
}

// ─── Fetch ────────────────────────────────────────────────────────────────────
async function fetchHistory(lcId = "") {
  try {
    const url = lcId
      ? `/api/v1/lifecycle/history?lifecycle_id=${encodeURIComponent(lcId)}`
      : `/api/v1/lifecycle/history`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch(e) {
    return [];
  }
}

async function fetchAllIds() {
  try {
    const res = await fetch("/api/v1/lifecycle/status");
    const data = res.ok ? await res.json() : [];
    return data.map(lc => lc.lifecycle_id).filter(Boolean);
  } catch {
    return [];
  }
}

// ─── Render ───────────────────────────────────────────────────────────────────
function renderTable(runs) {
  const tbody = el("history-body");

  if (!runs.length) {
    hide("history-table-wrap");
    show("history-empty");
    return;
  }

  show("history-table-wrap");
  hide("history-empty");

  tbody.innerHTML = runs.map(run => `
    <tr>
      <td>${tsCell(run.started_at)}</td>
      <td>${tsCell(run.closed_at)}</td>
      <td>${reportCell(run.archive, "ar", "A")}</td>
      <td>${reportCell(run.insert,  "ir", "I")}</td>
      <td>${reportCell(run.delete,  "dr", "D")}</td>
      <td>${statusBadge(run.overall_status)}</td>
    </tr>
  `).join("");
}

// ─── Filter autocomplete ──────────────────────────────────────────────────────
function setupFilter() {
  const input    = el("lc-filter");
  const dropdown = el("filter-dropdown");

  if (LIFECYCLE_ID) {
    input.value = LIFECYCLE_ID;
  }

  input.addEventListener("input", () => {
    const val = input.value.trim().toUpperCase();
    const matches = allIds.filter(id => id.toUpperCase().includes(val));
    if (matches.length && val) {
      dropdown.innerHTML = matches.map(id =>
        `<div class="filter-option" data-id="${id}">${id}</div>`
      ).join("") + `<div class="filter-option" data-id="">Show All</div>`;
      dropdown.style.display = "";
    } else {
      dropdown.style.display = "none";
    }
  });

  dropdown.addEventListener("click", async e => {
    const opt = e.target.closest(".filter-option");
    if (!opt) return;
    filteredId = opt.dataset.id;
    input.value = filteredId;
    dropdown.style.display = "none";
    await loadAndRender(filteredId);
  });

  input.addEventListener("keydown", async e => {
    if (e.key === "Enter") {
      filteredId = input.value.trim();
      dropdown.style.display = "none";
      await loadAndRender(filteredId);
    }
  });

  document.addEventListener("click", e => {
    if (!e.target.closest(".filter-wrap")) dropdown.style.display = "none";
  });
}

// ─── Export CSV ───────────────────────────────────────────────────────────────
window.exportCsv = function() {
  const completed = allRuns.filter(r => r.overall_status === "completed");
  if (!completed.length) { alert("No completed runs to export."); return; }

  const headers = ["lifecycle_id","lifecycle_run_id","started_at","closed_at",
                   "archive_object","archive_status","archive_report",
                   "insert_object","insert_status","insert_report",
                   "delete_object","delete_status","delete_report"];

  const rows = completed.map(r => [
    r.lifecycle_id,
    r.lifecycle_run_id,
    r.started_at,
    r.closed_at || "",
    r.archive?.object_name || "",
    r.archive?.status || "",
    r.archive?.report_path || "",
    r.insert?.object_name || "",
    r.insert?.status || "",
    r.insert?.report_path || "",
    r.delete?.object_name || "",
    r.delete?.status || "",
    r.delete?.report_path || "",
  ].map(v => `"${(v || "").replace(/"/g, '""')}"`).join(","));

  const csv  = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `cryonix_history_${filteredId || "all"}_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

// ─── Report viewer ────────────────────────────────────────────────────────────
window.openReport = function(e, encodedPath) {
  e.preventDefault();
  const path = decodeURIComponent(encodedPath);
  alert(`Report path:\n${path}\n\nOpen this file in your preferred viewer.`);
};

// ─── Load and render ──────────────────────────────────────────────────────────
async function loadAndRender(lcId = "") {
  hide("history-table-wrap");
  hide("history-empty");
  el("history-loading").style.display = "";

  allRuns = await fetchHistory(lcId);

  el("history-loading").style.display = "none";
  el("history-subtitle").textContent  = lcId
    ? `Showing runs for ${lcId} — ${allRuns.length} record${allRuns.length !== 1 ? "s" : ""}`
    : `All lifecycles — ${allRuns.length} record${allRuns.length !== 1 ? "s" : ""}`;

  renderTable(allRuns);
}

// ─── Init ─────────────────────────────────────────────────────────────────────
(async function init() {
  // Set up nav run link
  if (LIFECYCLE_ID) {
    el("nav-run").href = `run.html?id=${LIFECYCLE_ID}`;
  }

  allIds = await fetchAllIds();
  setupFilter();
  await loadAndRender(LIFECYCLE_ID);
})();
