(function () {
  const form = document.querySelector("#unlock-form");
  const passwordInput = document.querySelector("#password");
  const statusEl = document.querySelector("#status");
  const dashboardEl = document.querySelector("#dashboard");
  const reportsList = document.querySelector("#reports-list");

  const fields = {
    lastUpdated: document.querySelector("#last-updated"),
    totalRecordsProcessed: document.querySelector("#total-records"),
    validRecords: document.querySelector("#valid-records"),
    duplicateRecords: document.querySelector("#duplicate-records"),
    sourceSummary: document.querySelector("#source-summary"),
    importReadinessStatus: document.querySelector("#import-readiness"),
    validationStatus: document.querySelector("#validation-status"),
    publishedSafetyStatus: document.querySelector("#published-safety")
  };

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

  function formatNumber(value) {
    return Number(value || 0).toLocaleString();
  }

  function render(stats) {
    const sourceFiles = Array.isArray(stats.dataSourceSummary?.sourceFiles)
      ? stats.dataSourceSummary.sourceFiles.join(", ")
      : "No source file summary available.";

    fields.lastUpdated.textContent = stats.lastUpdated || "-";
    fields.totalRecordsProcessed.textContent = formatNumber(stats.totalRecordsProcessed);
    fields.validRecords.textContent = formatNumber(stats.validRecords);
    fields.duplicateRecords.textContent = formatNumber(stats.duplicateRecords);
    fields.sourceSummary.textContent = `${stats.sourcesCount || 0} source tables summarized: ${sourceFiles}`;
    fields.importReadinessStatus.textContent = stats.importReadinessStatus || "-";
    fields.validationStatus.textContent = stats.validationStatus || "-";
    fields.publishedSafetyStatus.textContent = stats.publishedSafetyStatus || "-";

    reportsList.replaceChildren();
    for (const report of stats.reports || []) {
      const item = document.createElement("li");
      const title = document.createElement("strong");
      const path = document.createElement("span");

      title.textContent = report.title || "Report";
      path.textContent = report.path || "";
      item.append(title, path);
      reportsList.append(item);
    }

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
