/**
 * run.js — Lifecycle Operations Page
 *
 * Reads ?id=LF01 from URL.
 * Fetches:
 *   GET /api/v1/lifecycle/status        → current execution state
 *   GET /api/v1/lifecycle/yaml/<id>     → lifecycle definition (YAML-sourced)
 *   GET /api/v1/lifecycle/definition/<id> → Optim metadata (parameters etc.)
 * Posts:
 *   POST /api/v1/lifecycle/run          → triggers execution
 */

const params      = new URLSearchParams(window.location.search);
const LIFECYCLE_ID = params.get("id");

let lcStatus  = null;   // current run state from CSV
let lcYaml    = null;   // lifecycle definition from YAML
let lcOptim   = null;   // Optim metadata (parameters)

// ─── Helpers ──────────────────────────────────────────────────────────────────
function el(id)  { return document.getElementById(id); }
function show(id){ const e = el(id); if(e) e.style.display = ""; }
function hide(id){ const e = el(id); if(e) e.style.display = "none"; }

function fmt(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (isNaN(d)) return ts;
  return d.toLocaleDateString("en-US", {month:"short",day:"numeric",year:"numeric"}) +
    " " + d.toLocaleTimeString("en-US", {hour:"2-digit",minute:"2-digit"});
}

function showToast(msg, type = "") {
  const t = el("toast");
  t.textContent = msg;
  t.className = `toast show${type ? " " + type : ""}`;
  setTimeout(() => { t.className = "toast"; }, 3000);
}

function showError(msg) {
  hide("run-loading");
  el("run-error-msg").textContent = msg;
  show("run-error");
}

// ─── Fetch data ───────────────────────────────────────────────────────────────
async function fetchAll() {
  if (!LIFECYCLE_ID) { showError("No lifecycle ID in URL."); return false; }

  try {
    const [statusRes, yamlRes, optimRes] = await Promise.all([
      fetch("/api/v1/lifecycle/status"),
      fetch(`/api/v1/lifecycle/yaml/${LIFECYCLE_ID}`),
      fetch(`/api/v1/lifecycle/definition/${LIFECYCLE_ID}`),
    ]);

    const allStatuses = statusRes.ok ? await statusRes.json() : [];
    lcStatus = allStatuses.find(s => s.lifecycle_id === LIFECYCLE_ID) || null;

    lcYaml = yamlRes.ok ? await yamlRes.json() : null;

    const optimData = optimRes.ok ? await optimRes.json() : [];
    lcOptim = Array.isArray(optimData) ? optimData[0] : optimData;

    return true;
  } catch(e) {
    showError("Failed to load lifecycle data: " + e.message);
    return false;
  }
}

// ─── Render ───────────────────────────────────────────────────────────────────
function render() {
  const name = lcYaml?.name || lcStatus?.lifecycle_id || LIFECYCLE_ID;
  const desc = lcYaml?.description || "";

  el("lc-id").textContent   = LIFECYCLE_ID;
  el("lc-name").textContent = name;
  el("lc-desc").textContent = desc;

  // Nav links
  el("nav-defn").href    = `defn.html?id=${LIFECYCLE_ID}`;
  el("nav-history").href = `history.html?id=${LIFECYCLE_ID}`;

  // Status banner
  renderStatusBanner();

  // Pipeline
  renderPipeline();

  // Actions and context
  renderActionPanel();
}

function renderStatusBanner() {
  const banner = el("status-banner");
  const steps  = lcStatus?.steps || {};
  const status = lcStatus?.status || "new_cycle";

  const map = {
    in_progress: { icon: "⟳", label: "Cycle in progress", cls: "in_progress" },
    completed:   { icon: "✓", label: "Last cycle completed",    cls: "completed"   },
    closed_incomplete: { icon: "⚠", label: "Last cycle incomplete", cls: "failed" },
    pending:     { icon: "○", label: "Ready to start",    cls: "pending"     },
    new_cycle:   { icon: "○", label: "Ready for new cycle", cls: "new_cycle"  },
  };

  const cfg = map[status] || map.new_cycle;
  banner.className = `status-banner ${cfg.cls}`;
  banner.innerHTML = `<span style="font-size:18px">${cfg.icon}</span>${cfg.label}`;
}

function renderPipeline() {
  const steps = lcStatus?.steps || { archive: "pending", insert: "pending", delete: "pending", completion: "pending" };
  const order = ["archive", "insert", "delete", "completion"];
  const labels = { archive: "Archive", insert: "Insert", delete: "Delete", completion: "Complete" };

  el("run-pipeline").innerHTML = order.map((step, i) => `
    <div class="pipe-step">
      <div class="pipe-dot ${steps[step] || "pending"}"></div>
      <span class="pipe-label ${steps[step] || "pending"}">${labels[step]}</span>
    </div>
    ${i < order.length - 1 ? `<span class="pipe-arrow">→</span>` : ""}
  `).join("");
}

function renderActionPanel() {
  const steps  = lcStatus?.steps || {};
  const status = lcStatus?.status || "new_cycle";

  const actionHeader = el("action-header");
  const actionBody   = el("action-body");
  const contextCard  = el("context-card");
  const contextBody  = el("context-body");

  // Determine next step
  const nextStep = determineNextStep(steps, status);

  if (!nextStep) {
    // Completed or nothing to do
    actionHeader.textContent = "Cycle Complete";
    actionBody.innerHTML = `
      <div class="no-action">
        <div class="no-action-icon">✓</div>
        <div>All steps completed for the current cycle.</div>
        <div style="margin-top:16px">
          <button class="btn-new-cycle" onclick="startNewCycle()">▶ Start New Cycle</button>
        </div>
      </div>`;
    hide("context-card");
    return;
  }

  // Build action panel for next step
  renderAction(nextStep, actionHeader, actionBody);

  // Build context panel (preceding steps)
  const precedingSteps = getPrecedingSteps(nextStep, steps);
  if (precedingSteps.length) {
    show("context-card");
    renderContext(precedingSteps, contextBody);
  } else {
    hide("context-card");
  }
}

function determineNextStep(steps, status) {
  if (status === "completed") return null;

  // Find first non-completed step
  const order = ["archive", "insert", "delete"];
  for (const step of order) {
    const s = steps[step];
    if (!s || s === "pending") return step;
    if (s === "in_progress")   return step; // still running
    if (s === "failed")        return step; // needs retry
  }
  return null;
}

function getPrecedingSteps(nextStep, steps) {
  const order = ["archive", "insert", "delete"];
  const idx   = order.indexOf(nextStep);
  return order.slice(0, idx).filter(s => steps[s] && steps[s] !== "pending");
}

function renderAction(nextStep, headerEl, bodyEl) {
  const stepLabels  = { archive: "Archive", insert: "Insert", delete: "Delete" };
  const stepClasses = { archive: "btn-run-archive", insert: "btn-run-insert", delete: "btn-run-delete" };
  const objMap      = {
    archive: lcYaml?.archive_request || lcOptim?.archive_request?.name || "—",
    insert:  lcYaml?.insert_request  || lcOptim?.insert_request?.name  || "—",
    delete:  lcYaml?.delete_request  || lcOptim?.delete_request?.name  || "—",
  };

  headerEl.textContent = `Run: ${stepLabels[nextStep] || nextStep}`;

  let html = `
    <div class="action-step-label">${stepLabels[nextStep] || nextStep} Request</div>
    <div class="action-obj-name">${objMap[nextStep]}</div>
  `;

  // Archive: show parameter inputs
  if (nextStep === "archive") {
    const params = lcOptim?.archive_request?.access_definition?.parameters || [];
    if (params.length) {
      html += `<div style="margin-bottom:16px">`;
      params.forEach(p => {
        html += `
          <div class="param-input-row">
            <label class="param-input-label">${p.name}</label>
            <span class="param-input-hint">${p.prompt || ""}</span>
            <input class="param-input" type="text"
              id="param-${p.name}" name="${p.name}"
              value="${p.default || ""}"
              placeholder="${p.default || ""}"/>
          </div>`;
      });
      html += `</div>`;
    }

    if (lcYaml?.parameter_file) {
      html += `
        <div class="file-path-row">
          <span class="file-path-label">Parameter File (will be written before execution)</span>
          <div class="file-path-val">${lcYaml.parameter_file}</div>
        </div>`;
    }

    html += `
      <div class="run-actions">
        <button class="btn-run-step btn-run-archive" onclick="runStep('archive')">
          ▶ Run Archive
        </button>
      </div>`;
  }

  // Insert or Delete: show archive file context, just run button
  if (nextStep === "insert" || nextStep === "delete") {
    const archiveFile = getArchiveFileFromStatus();
    if (archiveFile) {
      html += `
        <div class="file-path-row">
          <span class="file-path-label">Archive File (from preceding Archive step)</span>
          <div class="file-path-val">${archiveFile}</div>
        </div>`;
    }

    const btnClass = stepClasses[nextStep];
    const label    = stepLabels[nextStep];

    html += `<div class="run-actions">`;

    // If mid-cycle, offer both Continue and New Cycle
    if (lcStatus?.status === "in_progress") {
      html += `
        <button class="btn-run-step ${btnClass}" onclick="runStep('${nextStep}')">
          ▶ Continue — Run ${label}
        </button>
        <button class="btn-new-cycle" onclick="startNewCycle()">
          ↺ Abandon & Start New Cycle
        </button>`;
    } else {
      html += `
        <button class="btn-run-step ${btnClass}" onclick="runStep('${nextStep}')">
          ▶ Run ${label}
        </button>`;
    }

    html += `</div>`;
  }

  bodyEl.innerHTML = html;
}

function getArchiveFileFromStatus() {
  // Read from the CSV-derived status if available
  // For now returns the path from YAML-derived default
  if (lcYaml) {
    return `${lcYaml.reports_directory}\\${LIFECYCLE_ID}_ARCHIVE.AF`;
  }
  return null;
}

function renderContext(precedingSteps, bodyEl) {
  const stepLabels = { archive: "Archive", insert: "Insert", delete: "Delete" };
  const steps = lcStatus?.steps || {};

  bodyEl.innerHTML = precedingSteps.map(step => {
    const status = steps[step] || "pending";
    return `
      <div class="context-step">
        <div class="context-step-header">
          <div class="context-step-dot ${status}"></div>
          <span class="context-step-label">${stepLabels[step] || step}</span>
          <span class="context-step-time">${fmt(lcStatus?.started_at)}</span>
        </div>
        <div class="context-step-body">
          <div class="context-kv">
            <span class="context-key">Status</span>
            <span class="context-val">${status}</span>
          </div>
          ${lcYaml?.reports_directory ? `
          <div class="context-kv">
            <span class="context-key">Report</span>
            <span class="context-val">
              <a class="context-report-link" href="#" onclick="viewReport('${step}');return false;">
                ${LIFECYCLE_ID}_${step.toUpperCase()}.log
              </a>
            </span>
          </div>` : ""}
        </div>
      </div>`;
  }).join("");
}

// ─── Actions ──────────────────────────────────────────────────────────────────
window.runStep = async function(step) {
  // Collect parameters if archive
  const paramValues = {};
  if (step === "archive") {
    document.querySelectorAll(".param-input").forEach(input => {
      paramValues[input.name] = input.value;
    });
  }

  const payload = {
    lifecycle_id: LIFECYCLE_ID,
    step,
    parameters: paramValues,
    archive_file: getArchiveFileFromStatus(),
  };

  try {
    showToast(`Submitting ${step}…`);
    const res = await fetch("/api/v1/lifecycle/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      showToast(`${step} submitted — use Refresh to check progress.`, "success");
      await refresh();
    } else {
      const err = await res.json().catch(() => ({}));
      showToast(`Error: ${err.error || res.status}`, "error");
    }
  } catch(e) {
    showToast(`Submit failed: ${e.message}`, "error");
  }
};

window.startNewCycle = async function() {
  const payload = {
    lifecycle_id: LIFECYCLE_ID,
    action: "new_cycle",
  };
  try {
    await fetch("/api/v1/lifecycle/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    showToast("New cycle initiated.", "success");
    await refresh();
  } catch(e) {
    showToast("Failed to start new cycle.", "error");
  }
};

window.viewReport = function(step) {
  if (!lcYaml?.reports_directory) {
    showToast("Report directory not configured.", "error");
    return;
  }
  showToast(`Report: ${lcYaml.reports_directory}\\${LIFECYCLE_ID}_${step.toUpperCase()}.log`);
};

// ─── Refresh ──────────────────────────────────────────────────────────────────
window.refresh = async function() {
  el("btn-refresh").textContent = "⟳ Refreshing…";
  const ok = await fetchAll();
  if (ok) render();
  el("btn-refresh").textContent = "↺ Refresh";
};

// ─── Init ─────────────────────────────────────────────────────────────────────
(async function init() {
  if (!LIFECYCLE_ID) { showError("No lifecycle ID in URL. Use ?id=LF01"); return; }
  const ok = await fetchAll();
  if (ok) {
    hide("run-loading");
    show("run-content");
    render();
  }
})();
