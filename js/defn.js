const LIFECYCLE_ID = new URLSearchParams(window.location.search).get("id");

const el   = id => document.getElementById(id);
const set  = (id, v) => { const e = el(id); if (e) e.textContent = v || "—"; };
const show = id => { const e = el(id); if (e) e.style.display = ""; };
const hide = id => { const e = el(id); if (e) e.style.display = "none"; };

function fmt(ts) {
  if (!ts) return "";
  const n = ts.replace(/^(\d{4}-\d{2}-\d{2})-(\d{2})\.(\d{2})\.(\d{2})$/, "$1T$2:$3:$4");
  const d = new Date(n);
  if (isNaN(d)) return ts;
  return d.toLocaleDateString("en-US", { year:"numeric", month:"short", day:"numeric",
                                          hour:"2-digit", minute:"2-digit" });
}

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : "—"; }

function metaLine(summary) {
  if (!summary) return "";
  const parts = [];
  if (summary.last_updated) parts.push(fmt(summary.last_updated));
  if (summary.modified_by)  parts.push(summary.modified_by);
  return parts.join("  ·  ");
}

function renderRunLocation(prefix, yaml) {
  const loc = yaml?.run_location || "Local";
  set(`${prefix}-run-location`, cap(loc));
  if (loc.toLowerCase() === "server" && yaml?.server_name) {
    show(`${prefix}-server-row`);
    set(`${prefix}-server-name`, yaml.server_name);
  }
}

function render(lc, yaml) {
  document.title = `${lc.lifecycle_id} — ${lc.lifecycle_name || "Definition"}`;

  set("lc-id",   lc.lifecycle_id);
  set("lc-name", lc.lifecycle_name || lc.lifecycle_id);
  const updated = fmt(lc.last_updated_date_time || lc.last_updated_time);
  if (updated && el("lc-updated")) el("lc-updated").textContent = updated;

  // ── Archive
  const ar = lc.archive_request;
  if (ar) {
    set("ar-name", ar.name);
    set("ar-meta", metaLine(ar.summary));
    set("ar-desc", ar.summary?.description);

    const override = ar.runtime_override;
    const oEl = el("ar-override");
    if (oEl) {
      if (override === true)       { oEl.textContent = "Yes"; oEl.className = "doc-val bool-yes"; }
      else if (override === false) { oEl.textContent = "No";  oEl.className = "doc-val bool-no"; }
      else                         { oEl.textContent = "—";   oEl.className = "doc-val"; }
    }

    renderRunLocation("ar", yaml);

    const ad = ar.access_definition;
    if (ad) {
      set("ad-type", cap(ad.type));
      set("ad-name", ad.name);
      if (ad.last_updated) { show("ad-updated-row"); set("ad-updated", fmt(ad.last_updated)); }
      if (ad.modified_by)  { show("ad-by-row");      set("ad-by",      ad.modified_by); }

      const params = ad.parameters || [];
      if (params.length) {
        show("params-block");
        el("params-body").innerHTML = params.map(p => `
          <tr>
            <td><span class="p-name">${p.name||"—"}</span></td>
            <td><span class="p-prompt">${p.prompt||"—"}</span></td>
            <td><span class="p-default">${p.default??""}</span></td>
          </tr>`).join("");
      }
    }
  }

  // ── Insert
  const ir = lc.insert_request;
  if (ir) {
    set("ir-name", ir.name);
    set("ir-meta", metaLine(ir.summary));
    set("ir-desc", ir.summary?.description);
    renderRunLocation("ir", yaml);
    const tm = ir.table_map;
    if (tm) {
      show("ir-tm-section");
      set("tm-type", cap(tm.type));
      set("tm-name", tm.name);
      if (tm.description && tm.description.trim()) set("tm-desc", tm.description);
      else hide("tm-desc-row");
    }
  }

  // ── Delete
  const dr = lc.delete_request;
  if (dr) {
    set("dr-name", dr.name);
    set("dr-meta", metaLine(dr.summary));
    set("dr-desc", dr.summary?.description);
    renderRunLocation("dr", yaml);
  }

  loadAltDescs();
  hide("defn-loading");
  show("defn-content");
}

function loadAltDescs() {
  fetch(`/api/v1/lifecycle/alt-desc/${LIFECYCLE_ID}`)
    .then(r => r.ok ? r.json() : null)
    .then(d => {
      if (!d) return;
      ["ar","ir","dr"].forEach(s => {
        const inp = el(`${s}-alt-desc`);
        if (inp && d[s]) inp.value = d[s];
      });
    }).catch(() => {});
}

window.saveAltDesc = function(step) {
  const inp   = el(`${step}-alt-desc`);
  const val   = inp?.value?.trim() || "";
  const saved = el(`${step}-alt-saved`);
  fetch("/api/v1/lifecycle/alt-desc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lifecycle_id: LIFECYCLE_ID, step, description: val })
  }).then(r => {
    if (!saved) return;
    saved.textContent = r.ok ? "✓ Saved" : "Failed";
    saved.style.color = r.ok ? "" : "#d92d20";
    saved.classList.add("show");
    setTimeout(() => saved.classList.remove("show"), 2500);
  }).catch(() => {
    if (saved) {
      saved.textContent = "Failed"; saved.style.color = "#d92d20";
      saved.classList.add("show");
      setTimeout(() => saved.classList.remove("show"), 2500);
    }
  });
};

(async function init() {
  if (!LIFECYCLE_ID) {
    set("defn-error-msg", "No lifecycle ID in URL.");
    show("defn-error"); hide("defn-loading"); return;
  }
  try {
    const [or, yr] = await Promise.all([
      fetch(`/api/v1/lifecycle/definition/${LIFECYCLE_ID}`),
      fetch(`/api/v1/lifecycle/yaml/${LIFECYCLE_ID}`),
    ]);
    if (!or.ok) throw new Error(`HTTP ${or.status}`);
    const od = await or.json();
    const lc = Array.isArray(od) ? od[0] : od;
    if (!lc) throw new Error("Not found");
    const yaml = yr.ok ? await yr.json() : null;
    render(lc, yaml);
  } catch(e) {
    set("defn-error-msg", `Failed to load: ${e.message}`);
    show("defn-error"); hide("defn-loading");
  }
})();
