(function () {
  const form = document.querySelector("#unlock-form");
  const passwordInput = document.querySelector("#password");
  const statusEl = document.querySelector("#status");
  const lockedView = document.querySelector("#locked-view");
  const dashboard = document.querySelector("#dashboard");
  const totalPeople = document.querySelector("#total-people");
  const sentCount = document.querySelector("#sent-count");
  const leftCount = document.querySelector("#left-count");
  const exportCsvCount = document.querySelector("#export-csv-count");
  const cohortGrid = document.querySelector("#cohort-grid");

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
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed.toLocaleString("ru-RU") : "0";
  }

  function formatPercent(value) {
    const parsed = Number(value || 0) * 100;
    return `${Math.round(parsed)}%`;
  }

  function renderCohort(cohort) {
    const percent = Math.max(0, Math.min(Number(cohort.percent || 0), 1));
    const card = document.createElement("article");
    card.className = "cohort-card";

    if (percent > 0) {
      card.classList.add("active");
    }

    card.innerHTML = `
      <div class="cohort-top">
        <h4>${cohort.label}</h4>
        <strong>${formatNumber(cohort.total)}</strong>
      </div>
      <div class="progress-meta">
        <span>${formatPercent(percent)}</span>
      </div>
      <div class="progress-track" aria-hidden="true">
        <span style="width: ${percent * 100}%"></span>
      </div>
      <p>sent ${formatNumber(cohort.sent)} · left ${formatNumber(cohort.left)}</p>
    `;

    return card;
  }

  function render(stats) {
    totalPeople.textContent = formatNumber(stats.totals?.total);
    sentCount.textContent = formatNumber(stats.totals?.sent);
    leftCount.textContent = formatNumber(stats.totals?.left);
    exportCsvCount.textContent = formatNumber(stats.totals?.export_csv);

    cohortGrid.replaceChildren();
    for (const cohort of stats.cohorts || []) {
      cohortGrid.append(renderCohort(cohort));
    }

    lockedView.classList.add("compressed");
    dashboard.classList.remove("hidden");
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    statusEl.textContent = "Decrypting locally...";
    dashboard.classList.add("hidden");

    try {
      const stats = await decryptStats(passwordInput.value);
      render(stats);
      statusEl.textContent = "Unlocked. Aggregate cohort data is shown below.";
      passwordInput.value = "";
    } catch {
      statusEl.textContent = "Wrong password. Try again.";
    }
  });
}());
