/**
 * defn.js
 * Lifecycle Definition Viewer
 *
 * Fetches from: GET /api/v1/lifecycle/definition/<lifecycle_id>
 * Returns: array of matching lifecycle definitions (filtered by id)
 * Renders: structured read-only view of the lifecycle definition
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────
function set(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value || "—";
}

function setHtml(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

function show(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = "";
}

function hide(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = "none";
}

function formatDate(ts) {
  if (!ts) return "—";
  // Handle Optim date format: "2026-04-13-19.30.40"
  // Normalize to ISO-compatible
  const normalized = ts.replace(
    /^(\d{4}-\d{2}-\d{2})-(\d{2})\.(\d{2})\.(\d{2})$/,
    "$1T$2:$3:$4"
  );
  const d = new Date(normalized);
  if (isNaN(d)) return ts; // return raw if unparseable
  return d.toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

function checksumDisplay(val) {
  if (val === null || val === undefined) return "";
  return `CRC: ${val}`;
}

function boolBadge(val) {
  if (val === true)  return `<span class="bool-true">Yes</span>`;
  if (val === false) return `<span class="bool-false">No</span>`;
  return "—";
}

function renderFileCard(containerId, files, key, label) {
  const el = document.getElementById(containerId);
  if (!el || !files || !files[key]) return;
  const f = files[key];
  el.innerHTML = `
    <div class="file-card-label">${label}</div>
    <div class="file-card-path">${f.path || "—"}</div>
    <div class="file-card-desc">${f.description || ""}</div>
  `;
}

// ─── Render ───────────────────────────────────────────────────────────────────
function render(lc) {
  document.title = `${lc.lifecycle_id} — ${lc.lifecycle_name || "Definition"}`;

  // ── Lifecycle header
  set("lc-id",      lc.lifecycle_id);
  set("lc-name",    lc.lifecycle_name);
  set("lc-desc",    lc.description);
  set("lc-updated", formatDate(lc.last_updated_date_time || lc.last_updated_time));

  // Step flow pills
  setHtml("lc-step-flow", `
    <span class="flow-pill ar">Archive</span>
    <span class="flow-arrow">→</span>
    <span class="flow-pill ir">Insert</span>
    <span class="flow-arrow">→</span>
    <span class="flow-pill dr">Delete</span>
    <span class="flow-arrow">→</span>
    <span class="flow-pill val">Validate</span>
  `);

  // ── Archive Request
  const ar = lc.archive_request;
  if (ar) {
    set("ar-name",     ar.name);
    set("ar-checksum", checksumDisplay(ar.checksum));
    set("ar-desc",     ar.summary?.description);
    set("ar-updated",  formatDate(ar.summary?.last_updated));
    set("ar-by",       ar.summary?.modified_by);
    document.getElementById("ar-override").innerHTML =
      boolBadge(ar.runtime_override);

    const ad = ar.access_definition;
    if (ad) {
      set("ad-type", ad.type ? ad.type.charAt(0).toUpperCase() + ad.type.slice(1) : "—");
      set("ad-name", ad.name);
      set("ad-desc", ad.description);

      if (ad.parameters && ad.parameters.length > 0) {
        show("params-section");
        document.getElementById("params-body").innerHTML = ad.parameters.map(p => `
          <tr>
            <td><span class="param-name">${p.name || "—"}</span></td>
            <td><span class="param-prompt">${p.prompt || "—"}</span></td>
            <td><span class="param-default">${p.default ?? "—"}</span></td>
          </tr>
        `).join("");
      }
    }
  }

  // ── Insert Request
  const ir = lc.insert_request;
  if (ir) {
    set("ir-name",     ir.name);
    set("ir-checksum", checksumDisplay(ir.checksum));
    set("ir-desc",     ir.summary?.description);
    set("ir-updated",  formatDate(ir.summary?.last_updated));
    set("ir-by",       ir.summary?.modified_by);

    if (ir.files) {
      show("ir-files-section");
      renderFileCard("ir-archive-file", ir.files, "archive_file", "Archive File");
      renderFileCard("ir-control-file", ir.files, "control_file", "Control File");
    }

    const tm = ir.table_map;
    if (tm) {
      show("ir-tm-section");
      set("tm-type", tm.type ? tm.type.charAt(0).toUpperCase() + tm.type.slice(1) : "—");
      set("tm-name", tm.name);
      set("tm-desc", tm.description);

      if (tm.last_updated) {
        show("tm-updated-row");
        set("tm-updated", formatDate(tm.last_updated));
      }
      if (tm.modified_by) {
        show("tm-by-row");
        set("tm-by", tm.modified_by);
      }
    }
  }

  // ── Delete Request
  const dr = lc.delete_request;
  if (dr) {
    set("dr-name",     dr.name);
    set("dr-checksum", checksumDisplay(dr.checksum));
    set("dr-desc",     dr.summary?.description);
    set("dr-updated",  formatDate(dr.summary?.last_updated));
    set("dr-by",       dr.summary?.modified_by);

    if (dr.files) {
      show("dr-files-section");
      renderFileCard("dr-archive-file", dr.files, "archive_file", "Archive File");
      renderFileCard("dr-control-file", dr.files, "control_file", "Control File");
    }
  }

  // Show content
  hide("defn-loading");
  show("defn-content");
}

// ─── Error ────────────────────────────────────────────────────────────────────
function showError(msg) {
  hide("defn-loading");
  document.getElementById("defn-error-msg").textContent = msg;
  show("defn-error");
}

// ─── Init ─────────────────────────────────────────────────────────────────────
(function init() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");

  if (!id) {
    showError("No lifecycle ID provided. Use ?id=LF01 in the URL.");
    return;
  }

  fetch(`/api/v1/lifecycle/definition/${id}`)
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then(data => {
      // API returns an array — take first match
      const lc = Array.isArray(data) ? data[0] : data;
      if (!lc) {
        showError(`No definition found for lifecycle "${id}".`);
        return;
      }
      render(lc);
    })
    .catch(err => {
      showError(`Failed to load definition: ${err.message}`);
    });
})();
