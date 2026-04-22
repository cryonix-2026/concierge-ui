/**
 * defn.js — Lifecycle Definition Viewer
 * Fetches: GET /api/v1/lifecycle/definition/<lifecycle_id>
 * Saves alternate descriptions: POST /api/v1/lifecycle/alt-desc
 */

const params = new URLSearchParams(window.location.search);
const LIFECYCLE_ID = params.get("id");

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
  const normalized = ts.replace(
    /^(\d{4}-\d{2}-\d{2})-(\d{2})\.(\d{2})\.(\d{2})$/,
    "$1T$2:$3:$4"
  );
  const d = new Date(normalized);
  if (isNaN(d)) return ts;
  return d.toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

function boolBadge(val) {
  if (val === true)  return `<span class="bool-true">Yes</span>`;
  if (val === false) return `<span class="bool-false">No</span>`;
  return "—";
}

function capitalize(str) {
  if (!str) return "—";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ─── Render ───────────────────────────────────────────────────────────────────
function render(lc) {
  document.title = `${lc.lifecycle_id} — ${lc.lifecycle_name || "Definition"}`;

  // Header
  set("lc-id",      lc.lifecycle_id);
  set("lc-name",    lc.lifecycle_name);
  set("lc-desc",    lc.description);
  set("lc-updated", formatDate(lc.last_updated_date_time || lc.last_updated_time));

  // ── Archive Request
  const ar = lc.archive_request;
  if (ar) {
    set("ar-name", ar.name);
    document.getElementById("ar-override").innerHTML = boolBadge(ar.runtime_override);
    set("ar-desc",    ar.summary?.description);
    set("ar-updated", formatDate(ar.summary?.last_updated));
    set("ar-by",      ar.summary?.modified_by);

    const ad = ar.access_definition;
    if (ad) {
      set("ad-type", capitalize(ad.type));
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
    set("ir-name",    ir.name);
    set("ir-desc",    ir.summary?.description);
    set("ir-updated", formatDate(ir.summary?.last_updated));
    set("ir-by",      ir.summary?.modified_by);

    const tm = ir.table_map;
    if (tm) {
      show("ir-tm-section");
      set("tm-type", capitalize(tm.type));
      set("tm-name", tm.name);
      set("tm-desc", tm.description);
    }
  }

  // ── Delete Request
  const dr = lc.delete_request;
  if (dr) {
    set("dr-name",    dr.name);
    set("dr-desc",    dr.summary?.description);
    set("dr-updated", formatDate(dr.summary?.last_updated));
    set("dr-by",      dr.summary?.modified_by);
  }

  // ── Load alternate descriptions from YAML (if saved previously)
  loadAltDescs();

  hide("defn-loading");
  show("defn-content");
}

// ─── Alternate Description ────────────────────────────────────────────────────
function loadAltDescs() {
  fetch(`/api/v1/lifecycle/alt-desc/${LIFECYCLE_ID}`)
    .then(res => res.ok ? res.json() : null)
    .then(data => {
      if (!data) return;
      if (data.ar) document.getElementById("ar-alt-desc").value = data.ar;
      if (data.ir) document.getElementById("ir-alt-desc").value = data.ir;
      if (data.dr) document.getElementById("dr-alt-desc").value = data.dr;
    })
    .catch(() => {}); // Silently ignore — alt descs are optional
}

window.saveAltDesc = function(step) {
  const textarea = document.getElementById(`${step}-alt-desc`);
  const savedEl  = document.getElementById(`${step}-alt-saved`);
  const value    = textarea?.value?.trim();

  fetch("/api/v1/lifecycle/alt-desc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lifecycle_id: LIFECYCLE_ID,
      step,
      description: value
    })
  })
  .then(res => {
    if (res.ok) {
      if (savedEl) {
        savedEl.textContent = "✓ Saved";
        savedEl.classList.add("show");
        setTimeout(() => savedEl.classList.remove("show"), 2500);
      }
    }
  })
  .catch(() => {
    if (savedEl) {
      savedEl.textContent = "Save failed";
      savedEl.style.color = "#d92d20";
      savedEl.classList.add("show");
      setTimeout(() => savedEl.classList.remove("show"), 2500);
    }
  });
};

// ─── Error ────────────────────────────────────────────────────────────────────
function showError(msg) {
  hide("defn-loading");
  document.getElementById("defn-error-msg").textContent = msg;
  show("defn-error");
}

// ─── Init ─────────────────────────────────────────────────────────────────────
(function init() {
  if (!LIFECYCLE_ID) {
    showError("No lifecycle ID provided. Use ?id=LF01 in the URL.");
    return;
  }

  fetch(`/api/v1/lifecycle/definition/${LIFECYCLE_ID}`)
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then(data => {
      const lc = Array.isArray(data) ? data[0] : data;
      if (!lc) {
        showError(`No definition found for lifecycle "${LIFECYCLE_ID}".`);
        return;
      }
      render(lc);
    })
    .catch(err => showError(`Failed to load definition: ${err.message}`));
})();
