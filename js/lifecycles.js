import { fetchLifecycleStatus } from "/concierge-ui/js/api.js";

const tbody = document.getElementById("lifecycle-body");

const dotClass = {
  completed:   "green",
  in_progress: "blue",
  pending:     "gray",
  failed:      "red",
  submitted:   "blue",
};

// Step labels — Completion renamed to Complete
const stepLabel = {
  archive:    "Archive",
  insert:     "Insert",
  delete:     "Delete",
  completion: "Complete",
};

function formatDateTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (isNaN(d)) return ts;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    + "<br>" + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function renderWorkflow(steps) {
  const order = ["archive", "insert", "delete", "completion"];
  return `
    <div class="workflow-cell">
      <div class="workflow">
        <div class="workflow-line"></div>
        ${order.map(step => `
          <div class="step">
            <div class="dot ${dotClass[steps[step]] || "gray"}"></div>
            <div class="label">${stepLabel[step]}</div>
          </div>`
        ).join("")}
      </div>
      <div class="workflow-actions-bar">
        <a href="/concierge-ui/defn.html?id=LIFECYCLE_ID" target="_blank">Definition</a>
        <a href="/concierge-ui/run.html?id=LIFECYCLE_ID">Run</a>
        <a href="/concierge-ui/history.html?id=LIFECYCLE_ID">History</a>
      </div>
    </div>
  `;
}

function renderActions(steps, lifecycleId) {
  // Inline the ID into the template (avoids closure issues)
  return renderWorkflow(steps).replace(/LIFECYCLE_ID/g, lifecycleId);
}

function computeSortKey(item) {
  const s = item.status;
  if (s === "in_progress" || s === "submitted") return 0;
  if (s === "completed" || s === "completed_externally") return 1;
  if (s === "closed_incomplete") return 2;
  return 3;
}

// Fetch lifecycle definitions to get names
async function fetchDefinitions() {
  try {
    const res = await fetch("/api/v1/lifecycle/definitions");
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

async function loadLifecycles() {
  try {
    const [data, definitions] = await Promise.all([
      fetchLifecycleStatus(),
      fetchDefinitions(),
    ]);

    // Build name lookup from definitions
    const nameMap = {};
    definitions.forEach(lc => {
      nameMap[lc.id] = { name: lc.name, description: lc.description };
    });

    data.sort((a, b) => {
      const ka = computeSortKey(a), kb = computeSortKey(b);
      if (ka !== kb) return ka - kb;
      return new Date(b.started_at) - new Date(a.started_at);
    });

    tbody.innerHTML = data.map(item => {
      const defn = nameMap[item.lifecycle_id] || {};
      const name = defn.name || item.lifecycle_name || item.lifecycle_id;

      return `
        <tr>
          <td>
            <div class="lc-cell">
              <div class="lc-id">${item.lifecycle_id}</div>
              <div class="lc-name">${name}</div>
            </div>
          </td>
          <td>
            ${renderActions(item.steps, item.lifecycle_id)}
          </td>
          <td class="date-cell">
            ${item.started_at ? formatDateTime(item.started_at) : "—"}
          </td>
          <td class="date-cell">
            ${item.closed_at
              ? formatDateTime(item.closed_at)
              : item.status === "in_progress"
                ? "<span style='color:#2563eb;font-size:10px;'>In progress…</span>"
                : "—"}
          </td>
        </tr>
      `;
    }).join("");

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" class="loading-cell">Error loading lifecycles: ${err.message}</td></tr>`;
  }
}

loadLifecycles();
