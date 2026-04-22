import { fetchLifecycleStatus } from "./api.js";

const tbody = document.getElementById("lifecycle-body");

const dotClass = {
  completed:   "green",
  in_progress: "blue",
  pending:     "gray",
  failed:      "red"
};

function formatDateTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (isNaN(d)) return ts;
  return d.toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric"
  }) + "<br>" + d.toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit"
  });
}

function renderWorkflow(steps) {
  const order = ["archive", "insert", "delete", "completion"];
  return `
    <div class="workflow">
      <div class="workflow-line"></div>
      ${order.map(step => `
        <div class="step">
          <div class="dot ${dotClass[steps[step]] || "gray"}"></div>
          <div class="label">${step.charAt(0).toUpperCase() + step.slice(1)}</div>
        </div>`
      ).join("")}
    </div>
  `;
}

function renderActions(lifecycleId) {
  return `
    <div class="workflow-actions-bar">
      <a href="/concierge-ui/defn.html?id=${lifecycleId}" target="_blank">Definition</a>
      <a href="/concierge-ui/run.html?id=${lifecycleId}">Run</a>
      <a href="/concierge-ui/history.html?id=${lifecycleId}">History</a>
    </div>
  `;
}

function computeSortKey(item) {
  const s = item.status;
  if (s === "in_progress" || s === "submitted") return 0;
  if (s === "completed" || s === "completed_externally") return 1;
  if (s === "closed_incomplete") return 2;
  return 3;
}

async function loadLifecycles() {
  try {
    const data = await fetchLifecycleStatus();

    data.sort((a, b) => {
      const ka = computeSortKey(a), kb = computeSortKey(b);
      if (ka !== kb) return ka - kb;
      return new Date(b.started_at) - new Date(a.started_at);
    });

    tbody.innerHTML = data.map(item => `
      <tr>
        <td>
          <div class="lc-cell">
            <div class="lc-id">${item.lifecycle_id}</div>
            <div class="lc-name">${item.lifecycle_name || item.lifecycle_id}</div>
            ${item.description ? `<div class="lc-desc">${item.description}</div>` : ""}
          </div>
        </td>
        <td>
          ${renderWorkflow(item.steps)}
          ${renderActions(item.lifecycle_id)}
        </td>
        <td class="date-cell">
          ${item.started_at ? formatDateTime(item.started_at) : "—"}
        </td>
        <td class="date-cell">
          ${item.closed_at ? formatDateTime(item.closed_at) : item.status === "in_progress" ? "<span style='color:#2563eb;font-size:10px;'>In progress…</span>" : "—"}
        </td>
      </tr>
    `).join("");

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" class="loading-cell">Error loading lifecycles: ${err.message}</td></tr>`;
  }
}

loadLifecycles();
