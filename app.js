(function () {
  const form = document.querySelector("#unlock-form");
  const passwordInput = document.querySelector("#password");
  const statusEl = document.querySelector("#status");
  const dashboardEl = document.querySelector("#dashboard");
  const summaryCards = document.querySelector("#summary-cards");
  const overviewList = document.querySelector("#overview-list");
  const fileBreakdown = document.querySelector("#file-breakdown");
  const emailStatus = document.querySelector("#email-status");
  const publishingStatus = document.querySelector("#publishing-status");
  const nextActionText = document.querySelector("#next-action-text");
  const publicUrl = document.querySelector("#public-url");
  const chartCanvas = document.querySelector("#emails-chart");
  const chartNote = document.querySelector("#chart-note");

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

  function valueText(value) {
    if (value === null || value === undefined || value === "") {
      return EMPTY;
    }

    return String(value);
  }

  function numberText(value) {
    if (value === null || value === undefined || value === "") {
      return EMPTY;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed.toLocaleString() : EMPTY;
  }

  function metricValue(primary, fallback) {
    return primary === null || primary === undefined ? fallback : primary;
  }

  function shortCommit(value) {
    return typeof value === "string" && value.length > 7 ? value.slice(0, 7) : valueText(value);
  }

  function badgeLabel(value) {
    const label = valueText(value);
    const normalized = label.toLowerCase();
    let type = "neutral";

    if (normalized.includes("safe") || normalized.includes("pass") || normalized.includes("publish") || normalized.includes("success") || normalized.includes("processed")) {
      type = "good";
    } else if (normalized.includes("review") || normalized.includes("not available") || normalized.includes("pending")) {
      type = "warn";
    }

    return `<span class="badge ${type}">${label}</span>`;
  }

  function clear(element) {
    element.replaceChildren();
  }

  function renderCard(container, label, value, note, badge) {
    const article = document.createElement("article");
    article.className = "summary-card";
    article.innerHTML = `
      <span>${label}</span>
      <strong>${valueText(value)}</strong>
      <p>${note}</p>
      ${badge ? badgeLabel(badge) : ""}
    `;
    container.append(article);
  }

  function renderStatusItem(container, label, value, note, badge) {
    const item = document.createElement("article");
    item.className = "status-card";
    item.innerHTML = `
      <div>
        <span>${label}</span>
        <strong>${valueText(value)}</strong>
      </div>
      <p>${note}</p>
      ${badge ? badgeLabel(badge) : ""}
    `;
    container.append(item);
  }

  function renderFileCards(files) {
    clear(fileBreakdown);

    if (!Array.isArray(files) || files.length === 0) {
      const empty = document.createElement("article");
      empty.className = "file-card empty-state";
      empty.textContent = "Файловая разбивка пока недоступна.";
      fileBreakdown.append(empty);
      return;
    }

    for (const file of files) {
      const card = document.createElement("article");
      card.className = "file-card";
      card.innerHTML = `
        <div class="file-card-header">
          <div>
            <span>${valueText(file.sourceType)}</span>
            <h3>${valueText(file.fileDisplayName)}</h3>
          </div>
          ${badgeLabel(file.processingStatus)}
        </div>
        <div class="mini-grid">
          <div><span>Total rows</span><strong>${numberText(file.totalRows)}</strong></div>
          <div><span>Emails found</span><strong>${numberText(file.emailsFound)}</strong></div>
          <div><span>Unique emails</span><strong>${numberText(file.uniqueEmails)}</strong></div>
          <div><span>New emails</span><strong>${numberText(file.newEmails)}</strong></div>
          <div><span>Duplicates</span><strong>${numberText(file.duplicateEmails)}</strong></div>
          <div><span>Known emails</span><strong>${numberText(file.alreadyKnownEmails)}</strong></div>
        </div>
        <p>Последняя обработка: ${valueText(file.lastProcessedAt)}</p>
      `;
      fileBreakdown.append(card);
    }
  }

  function chartMetric(item) {
    return Number.isFinite(Number(item.newEmails)) ? Number(item.newEmails) : Number(item.uniqueEmails || 0);
  }

  function renderChart(chartData) {
    const rows = Array.isArray(chartData?.newEmailsByFile) ? chartData.newEmailsByFile : [];
    const context = chartCanvas.getContext("2d");
    const ratio = window.devicePixelRatio || 1;
    const width = chartCanvas.clientWidth || chartCanvas.parentElement.clientWidth;
    const height = Math.max(260, rows.length * 42 + 80);

    chartCanvas.width = Math.floor(width * ratio);
    chartCanvas.height = Math.floor(height * ratio);
    chartCanvas.style.height = `${height}px`;
    context.scale(ratio, ratio);
    context.clearRect(0, 0, width, height);

    if (rows.length === 0) {
      context.fillStyle = "#5f6b7a";
      context.font = "700 15px system-ui, sans-serif";
      context.fillText("Данные для графика пока недоступны.", 18, 42);
      chartNote.textContent = "График появится после добавления агрегированных данных по источникам.";
      return;
    }

    const usesFallback = rows.some((row) => row.newEmails === null || row.newEmails === undefined);
    const values = rows.map(chartMetric);
    const max = Math.max(...values, 1);
    const labelWidth = Math.min(160, Math.max(96, width * 0.32));
    const barArea = Math.max(width - labelWidth - 70, 80);

    context.font = "700 13px system-ui, sans-serif";
    context.textBaseline = "middle";

    rows.forEach((row, index) => {
      const y = 42 + index * 42;
      const value = values[index];
      const barWidth = Math.max((value / max) * barArea, value > 0 ? 8 : 2);

      context.fillStyle = "#111827";
      context.fillText(valueText(row.label), 0, y);
      context.fillStyle = "#e8eef6";
      context.fillRect(labelWidth, y - 11, barArea, 22);
      context.fillStyle = "#1f6feb";
      context.fillRect(labelWidth, y - 11, barWidth, 22);
      context.fillStyle = "#111827";
      context.fillText(numberText(value), labelWidth + barArea + 14, y);
    });

    chartNote.textContent = usesFallback
      ? "New emails пока недоступны, поэтому график показывает unique emails по источникам."
      : "Количество новых email по каждому источнику после обработки.";
  }

  function render(stats) {
    const summary = stats.executiveSummary || {};
    const totalRecords = metricValue(summary.totalRecordsProcessed, stats.totalRecordsProcessed);
    const duplicateRecords = metricValue(summary.duplicateRecords, stats.duplicateRecords);
    const sourceCount = metricValue(summary.sourceFilesAnalyzed, stats.sourcesCount);

    clear(summaryCards);
    renderCard(summaryCards, "Total records processed", numberText(totalRecords), "Все записи, учтенные в безопасной агрегированной сводке.");
    renderCard(summaryCards, "Total unique emails processed", numberText(summary.totalUniqueEmailsProcessed), "Уникальные email посчитаны без публикации адресов.");
    renderCard(summaryCards, "New emails discovered", numberText(summary.newEmailsDiscovered), "Если точный расчет небезопасен, значение остается недоступным.");
    renderCard(summaryCards, "Duplicate records", numberText(duplicateRecords), "Агрегированная оценка дублей.");
    renderCard(summaryCards, "Source files analyzed", numberText(sourceCount), "Количество безопасно проанализированных источников.");
    renderCard(summaryCards, "Validation status", valueText(summary.validationStatus), "Результат проверки publish payload.", summary.validationStatus);
    renderCard(summaryCards, "Publishing safety status", valueText(summary.publishingSafetyStatus), "Публичный repo содержит только encrypted static output.", summary.publishingSafetyStatus);
    renderCard(summaryCards, "Last updated", valueText(stats.lastUpdated), `Версия: ${valueText(stats.dashboardVersion)}`);

    clear(overviewList);
    renderStatusItem(overviewList, "Processing scope", `${numberText(sourceCount)} sources`, "Агрегаты рассчитаны без публикации raw строк.");
    renderStatusItem(overviewList, "Public repository", valueText(stats.publicRepo), "Отдельный публичный repo только для encrypted output.", "published");
    renderStatusItem(overviewList, "Workflow status", valueText(stats.latestWorkflowStatus), "Последний статус публикационного процесса.", stats.latestWorkflowStatus);
    renderStatusItem(overviewList, "Latest public commit", shortCommit(stats.latestPublicCommit), "Последняя опубликованная версия public dashboard.");

    renderFileCards(stats.fileBreakdown);
    renderChart(stats.chartData);

    clear(emailStatus);
    renderStatusItem(emailStatus, "Unique emails", numberText(summary.totalUniqueEmailsProcessed), "Email обработаны только как агрегированные counts.");
    renderStatusItem(emailStatus, "New emails", numberText(summary.newEmailsDiscovered), "Точное значение не выводится, если нет безопасного источника сравнения.");
    renderStatusItem(emailStatus, "Readiness", valueText(summary.validationStatus), "Готовность к дальнейшим действиям определяется safe validation.", summary.validationStatus);

    clear(publishingStatus);
    renderStatusItem(publishingStatus, "Safety notice", valueText(stats.safetyNotice), "Это сообщение остается видимым до и после unlock.", "safe");
    renderStatusItem(publishingStatus, "Publishing status", valueText(summary.publishingSafetyStatus), "Публичная страница не содержит raw data.", summary.publishingSafetyStatus);
    renderStatusItem(publishingStatus, "Public URL", valueText(stats.publicUrl), "GitHub Pages endpoint для encrypted dashboard.", "published");

    nextActionText.textContent = valueText(summary.nextRecommendedAction);
    if (stats.publicUrl) {
      publicUrl.href = stats.publicUrl;
    }

    dashboardEl.classList.remove("hidden");
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    statusEl.textContent = "Расшифровка выполняется локально...";
    dashboardEl.classList.add("hidden");

    try {
      const stats = await decryptStats(passwordInput.value);
      render(stats);
      statusEl.textContent = "Готово. Агрегированные данные расшифрованы в этом браузере.";
      passwordInput.value = "";
    } catch {
      statusEl.textContent = "Не удалось открыть отчет. Проверьте пароль и повторите попытку.";
    }
  });
}());
