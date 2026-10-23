const form = document.getElementById("prediction-form");
const predictButton = document.getElementById("predict-button");
const emptyResult = document.getElementById("empty-result");
const predictionResult = document.getElementById("prediction-result");
const errorResult = document.getElementById("error-result");
const predictionView = document.getElementById("predict");
const historyView = document.getElementById("history-view");
const predictionNav = document.getElementById("prediction-nav");
const historyNav = document.getElementById("history-nav");
const historyList = document.getElementById("history-list");
const historyStatus = document.getElementById("history-status");
let lastPayload = null;

function showState(state) {
  emptyResult.classList.toggle("hidden", state !== "empty");
  predictionResult.classList.toggle("hidden", state !== "prediction");
  errorResult.classList.toggle("hidden", state !== "error");
}

function setLoading(loading) {
  predictButton.disabled = loading;
  predictButton.querySelector("span:first-child").textContent = loading ? "Predicting..." : "Predict churn";
  predictButton.querySelector(".button-arrow").textContent = loading ? "…" : "↗";
}

function showPrediction(prediction) {
  const result = Number(prediction);
  if (!Number.isFinite(result)) {
    throw new Error("The API returned a prediction that was not a number.");
  }

  predictionResult.classList.remove("churn", "stay");
  const isChurn = result === 1;
  predictionResult.classList.add(isChurn ? "churn" : "stay");
  document.getElementById("outcome-icon").textContent = isChurn ? "!" : "✓";
  document.getElementById("outcome-label").textContent = "PREDICTION RESULT";
  document.getElementById("outcome-title").textContent = isChurn ? "Churn predicted" : "No churn predicted";
  document.getElementById("outcome-description").textContent = isChurn
    ? "The model classified this customer as likely to churn. Consider reviewing their experience and retention options."
    : "The model did not classify this customer as likely to churn. Continue monitoring their experience over time.";
  document.getElementById("model-output").textContent = String(result);
  document.getElementById("assessment-type").textContent = "Predicted class";
  showState("prediction");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[character]));
}

function formatHistoryDate(timestamp) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? "Unknown date" : date.toLocaleString();
}

function historyInputMarkup(record) {
  return `
    <div class="history-inputs">
      <span><b>Contract</b>${escapeHtml(record.contract)}</span>
      <span><b>Tenure</b>${escapeHtml(record.tenure_month)} months</span>
      <span><b>Charges</b>$${Number(record.totalcharges).toFixed(2)}</span>
      <span><b>Payment</b>${escapeHtml(record.paymentmethod)}</span>
      <span><b>Internet</b>${escapeHtml(record.internetservice)}</span>
      <span><b>Security</b>${escapeHtml(record.onlinesecurity)}</span>
      <span><b>Support</b>${escapeHtml(record.techsupport)}</span>
    </div>`;
}

function renderHistory(records) {
  if (!records.length) {
    historyList.innerHTML = `
      <div class="history-empty">
        <div class="result-center">◷</div>
        <h3>No predictions yet</h3>
        <p>Submitted customer profiles will appear here after you run a prediction.</p>
      </div>`;
    return;
  }

  historyList.innerHTML = records.map(record => {
    const isChurn = Number(record.prediction) === 1;
    const timestamp = escapeHtml(record.timestamp);
    const itemId = escapeHtml(record.id);
    const displayDate = escapeHtml(formatHistoryDate(record.timestamp));
    return `
      <article class="history-card">
        <div class="history-card-header">
          <div class="history-outcome ${isChurn ? "churn" : "stay"}">
            <span>${isChurn ? "!" : "✓"}</span>
            <strong>${isChurn ? "Churn predicted" : "No churn predicted"}</strong>
          </div>
          <div class="history-card-meta">
            <time datetime="${timestamp}">${displayDate}</time>
            <button type="button" class="history-delete" data-history-id="${itemId}" aria-label="Delete prediction from ${displayDate}">Delete</button>
          </div>
        </div>
        ${historyInputMarkup(record)}
      </article>`;
  }).join("");
}

async function loadHistory() {
  historyStatus.textContent = "Loading prediction history...";
  try {
    const response = await fetch("/history");
    if (!response.ok) throw new Error(`History request failed with HTTP ${response.status}.`);
    const data = await response.json();
    if (!Array.isArray(data.history)) throw new Error("The history API returned an invalid response.");
    renderHistory(data.history);
    historyStatus.textContent = `${data.history.length} prediction${data.history.length === 1 ? "" : "s"} recorded`;
  } catch (error) {
    historyList.innerHTML = "";
    historyStatus.textContent = error.message || "Could not load prediction history.";
  }
}

function showHistoryView(showHistory) {
  predictionView.classList.toggle("hidden", showHistory);
  historyView.classList.toggle("hidden", !showHistory);
  predictionNav.classList.toggle("active", !showHistory);
  predictionNav.classList.toggle("muted", showHistory);
  historyNav.classList.toggle("active", showHistory);
  historyNav.classList.toggle("muted", !showHistory);
  if (showHistory) loadHistory();
}

async function runPrediction(payload) {
  lastPayload = payload;
  setLoading(true);
  try {
    const response = await fetch("/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();
    let data;
    try {
      data = responseText ? JSON.parse(responseText) : {};
    } catch {
      const shortBody = responseText.slice(0, 500).trim();
      throw new Error(
        `The API returned non-JSON content (HTTP ${response.status}).` +
        (shortBody ? ` Server response: ${shortBody}` : "")
      );
    }

    if (!response.ok) {
      const details = data.detail;
      const message = Array.isArray(details)
        ? details.map(item => `${(item.loc || []).join(". ")}: ${item.msg}`).join("; ")
        : (typeof details === "string" ? details : `Request failed with HTTP ${response.status}.`);
      throw new Error(message);
    }
    if (!Object.prototype.hasOwnProperty.call(data, "prediction")) {
      throw new Error("The API response did not contain a 'prediction' field.");
    }
    showPrediction(data.prediction);
  } catch (error) {
    document.getElementById("error-message").textContent =
      `${error.message || "Unknown error"} Check that the FastAPI server is running and model.pkl is available.`;
    showState("error");
  } finally {
    setLoading(false);
  }
}

form.addEventListener("submit", event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const values = new FormData(form);
  const tenure = Number(values.get("tenure_month"));
  const charges = Number(values.get("totalcharges"));

  if (!Number.isInteger(tenure) || tenure < 0) {
    document.querySelector('[name="tenure_month"]').setCustomValidity("Enter a whole number of months, zero or greater.");
    document.querySelector('[name="tenure_month"]').reportValidity();
    document.querySelector('[name="tenure_month"]').setCustomValidity("");
    return;
  }
  if (!Number.isFinite(charges) || charges < 0) {
    document.querySelector('[name="totalcharges"]').setCustomValidity("Enter a non-negative total charge.");
    document.querySelector('[name="totalcharges"]').reportValidity();
    document.querySelector('[name="totalcharges"]').setCustomValidity("");
    return;
  }

  runPrediction({
    contract: values.get("contract"),
    tenure_month: tenure,
    totalcharges: charges,
    paymentmethod: values.get("paymentmethod"),
    internetservice: values.get("internetservice"),
    onlinesecurity: values.get("onlinesecurity"),
    techsupport: values.get("techsupport")
  });
});

predictionNav.addEventListener("click", () => showHistoryView(false));
historyNav.addEventListener("click", () => showHistoryView(true));
document.getElementById("refresh-history").addEventListener("click", loadHistory);
document.getElementById("clear-history").addEventListener("click", async () => {
  if (!window.confirm("Clear all prediction history? This cannot be undone.")) return;
  try {
    const response = await fetch("/history", { method: "DELETE" });
    if (!response.ok) throw new Error(`Could not clear history (HTTP ${response.status}).`);
    await loadHistory();
  } catch (error) {
    historyStatus.textContent = error.message || "Could not clear prediction history.";
  }
});

historyList.addEventListener("click", async event => {
  const deleteButton = event.target.closest("[data-history-id]");
  if (!deleteButton) return;
  const itemId = deleteButton.dataset.historyId;
  deleteButton.disabled = true;
  try {
    const response = await fetch(`/history/${encodeURIComponent(itemId)}`, { method: "DELETE" });
    if (!response.ok) throw new Error(`Could not delete history item (HTTP ${response.status}).`);
    await loadHistory();
  } catch (error) {
    deleteButton.disabled = false;
    historyStatus.textContent = error.message || "Could not delete history item.";
  }
});

form.addEventListener("reset", () => {
  window.setTimeout(() => {
    lastPayload = null;
    showState("empty");
  }, 0);
});

document.getElementById("new-prediction").addEventListener("click", () => {
  showHistoryView(false);
  form.scrollIntoView({ behavior: "smooth", block: "start" });
  document.querySelector('[name="contract"]').focus({ preventScroll: true });
});
document.getElementById("retry-button").addEventListener("click", () => {
  if (lastPayload) runPrediction(lastPayload);
  else form.requestSubmit();
});
