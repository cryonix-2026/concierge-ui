import { fetchLifecycleStatus } from "./api.js";

const tbody = document.getElementById("lifecycle-body");

const dotClass = {
  completed: "green",
  in_progress: "blue",
  pending: "gray",
  failed: "red"
};

function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleString();
}

function renderWorkflow(steps, lifecycleId) {
  const order = ["archive", "insert", "delete", "completion"];

  return `
    <div class="workflow">
      <div class="workflow-line"></div>
      ${order
        .map(
          step => `
        <div class="step">
          <div class="dot ${dotClass[steps[step]]}"></div>
          <div class="label">${step.charAt(0).toUpperCase() + step.slice(1)}</div>
        </div>`
        )
        .join("")}
    </div>

    <div class="workflow-actions-bar">
      <a href="#">Details</a>
      <a href="/concierge-ui/defn.html?id=${lifecycleId}" target="_blank">Definition</a>
      <a href="#">Run</a>
      <a href="#">History</a>
    </div>
  `;
}

/* function renderWorkflow(steps) {
  console.log("renderWorkflow called with:", steps);
  return "TEST";
} */


function computeSortKey(item) {
  const status = item.status;

  if (status === "in_progress") return 0;
  if (status === "completed") return 1;
  if (status === "completed_externally") return 1;
  if (status === "closed_incomplete") return 2;
  return 3;
}

async function loadLifecycles() {
  const data = await fetchLifecycleStatus();

  data.sort((a, b) => {
    const keyA = computeSortKey(a);
    const keyB = computeSortKey(b);

    if (keyA !== keyB) return keyA - keyB;

    const tA = new Date(a.started_at).getTime();
    const tB = new Date(b.started_at).getTime();
    return tB - tA;
  });

  tbody.innerHTML = data
  .map(
    item => `
      <tr>
        <td>${item.lifecycle_id}</td>
        <td>${renderWorkflow(item.steps, item.lifecycle_id)}</td>
        <td>${formatTime(item.started_at)}</td>
        <td>${formatTime(item.closed_at)}</td>
      </tr>
    `
  )
  .join("");

}

loadLifecycles();



