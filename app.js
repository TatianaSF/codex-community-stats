(function () {
  const form = document.querySelector("#unlock-form");
  const passwordInput = document.querySelector("#password");
  const statusEl = document.querySelector("#status");
  const dashboardEl = document.querySelector("#dashboard");
  const reportsList = document.querySelector("#reports-list");

  const fields = {
    lastUpdated: document.querySelector("#last-updated"),
    dashboardVersion: document.querySelector("#dashboard-version"),
    totalRecordsProcessed: document.querySelector("#total-records"),
    validRecords: document.querySelector("#valid-records"),
    duplicateRecords: document.querySelector("#duplicate-records"),
    sourceCount: document.querySelector("#source-count"),
    validationStatus: document.querySelector("#validation-status"),
    importReadinessStatus: document.querySelector("#import-readiness"),
    publishingStatus: document.querySelector("#publishing-status"),
    pagesStatus: document.querySelector("#pages-status"),
    pagesStatusChip: document.querySelector("#pages-status-chip"),
    publicRepoStatus: document.querySelector("#public-repo-status"),
    workflowStatus: document.querySelector("#workflow-status"),
    latestPublicCommit: document.querySelector("#latest-public-commit"),
    nextRecommendedAction: document.querySelector("#next-action"),
    publicUrl: document.querySelector("#public-url")
  };

  const EMPTY = "Not available yet";

  function fromBase64(value) {
    const binary = window.atob(value);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
  }

  async function deriveKey(password, salt, iterations) {
    const encoder = new TextEncoder();
    const material = await window.crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveKey"]
    );

    return window.crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations,
        hash: "SHA-256"
      },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );
  }

  async function decryptStats(password) {
    const response = await fetch("encrypted-stats.json", { cache: "no-store" });

    if (!response.ok) {
      throw new Error("Encrypted stats could not be loaded.");
    }

    const payload = await response.json();
    const key = await deriveKey(password, fromBase64(payload.salt), payload.iterations);
    const plaintext = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: fromBase64(payload.iv)
      },
      key,
      fromBase64(payload.ciphertext)
    );

    return JSON.parse(new TextDecoder().decode(plaintext));
  }

  function text(value) {
    if (value === null || value === undefined || value === "") {
      return EMPTY;
    }

    return String(value);
  }

  function number(value) {
    if (value === null || value === undefined || value === "") {
      return EMPTY;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed.toLocaleString() : EMPTY;
  }

  function shortCommit(value) {
    return typeof value === "string" && value.length > 7 ? value.slice(0, 7) : text(value);
  }

  function setChip(element, value) {
    const label = text(value);
    const normalized = label.toLowerCase();
    element.textContent = label;
    element.classList.remove("good", "warn", "neutral");

    if (normalized.includes("pass") || normalized.includes("safe") || normalized.includes("built") || normalized.includes("success") || normalized.includes("public")) {
      element.classList.add("good");
    } else if (normalized.includes("review") || normalized.includes("pending") || normalized.includes("not available")) {
      element.classList.add("warn");
    } else {
      element.classList.add("neutral");
    }
  }

  function renderReports(reports) {
    reportsList.replaceChildren();

    if (!Array.isArray(reports) || reports.length === 0) {
      const item = document.createElement("li");
      item.className = "empty-state";
      item.textContent = "No report references available yet.";
      reportsList.append(item);
      return;
    }

    for (const report of reports) {
      const item = document.createElement("li");
      const title = document.createElement("strong");
      const detail = document.createElement("span");

      title.textContent = text(report.title || report.name || "Report");
      detail.textContent = text(report.status || report.path || "Private reference");
      item.append(title, detail);
      reportsList.append(item);
    }
  }

  function render(stats) {
    fields.lastUpdated.textContent = text(stats.lastUpdated);
    fields.dashboardVersion.textContent = stats.dashboardVersion ? `Dashboard version ${stats.dashboardVersion}` : "Dashboard version not available yet";
    fields.totalRecordsProcessed.textContent = number(stats.totalRecordsProcessed);
    fields.validRecords.textContent = number(stats.validRecords);
    fields.duplicateRecords.textContent = number(stats.duplicateRecords);
    fields.validationStatus.textContent = text(stats.validationStatus);
    fields.importReadinessStatus.textContent = text(stats.importReadinessStatus);
    fields.publishingStatus.textContent = text(stats.publishingStatus || stats.publishedSafetyStatus);
    fields.pagesStatus.textContent = text(stats.githubPagesStatus || stats.publishingStatus);
    fields.publicRepoStatus.textContent = text(stats.publicRepo);
    fields.workflowStatus.textContent = text(stats.latestWorkflowStatus);
    fields.latestPublicCommit.textContent = shortCommit(stats.latestPublicCommit);
    fields.nextRecommendedAction.textContent = text(stats.nextRecommendedAction);

    setChip(fields.sourceCount, stats.sourcesCount ? `${stats.sourcesCount} sources` : EMPTY);
    setChip(fields.pagesStatusChip, stats.githubPagesStatus || stats.publishingStatus);

    if (stats.publicUrl) {
      fields.publicUrl.href = stats.publicUrl;
      fields.publicUrl.textContent = "Open public dashboard";
    }

    renderReports(stats.reports);
    dashboardEl.classList.remove("hidden");
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    statusEl.textContent = "Decrypting locally...";
    dashboardEl.classList.add("hidden");

    try {
      const stats = await decryptStats(passwordInput.value);
      render(stats);
      statusEl.textContent = "Unlocked. Aggregate dashboard data decrypted in this browser.";
      passwordInput.value = "";
    } catch {
      statusEl.textContent = "Unlock failed. Check the password and try again.";
    }
  });
}());
