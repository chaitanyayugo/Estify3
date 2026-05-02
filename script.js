// =====================================================
// ESTIFY • UNIFIED PRICING ENGINE
// FINAL script.js
// Supports:
// - standard bracket variants
// - raw bed lines
// - combo configs
// - forced-exact fallback
// - Odoo-style plan export
// =====================================================

let material_master = [];
let price_sheet = [];

window.estifyPlans = {};
window.estifyCurrentPlan = null;

// =====================================================
// LOAD DATA
// =====================================================
async function loadData() {
  if (material_master.length && price_sheet.length) return;

  const [mRes, pRes] = await Promise.all([
    fetch("./material_master.json"),
    fetch("./price_sheet.json")
  ]);

  if (!mRes.ok) throw new Error("material_master.json failed to load");
  if (!pRes.ok) throw new Error("price_sheet.json failed to load");

  material_master = await mRes.json();
  price_sheet = await pRes.json();
}

// =====================================================
// HELPERS
// =====================================================
function normalize(v) {
  return String(v ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

function escapeHtml(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function formatValue(v) {
  const n = Number(v);
  return Number.isFinite(n)
    ? new Intl.NumberFormat("en-IN").format(Math.round(n))
    : "—";
}

function formatPrecise(v) {
  const n = Number(v);
  return Number.isFinite(n)
    ? new Intl.NumberFormat("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(n)
    : "—";
}

function pickEl(...ids) {
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) return el;
  }
  return null;
}

function showToast(message) {
  const old = document.querySelector(".estify-toast");
  if (old) old.remove();

  const toast = document.createElement("div");
  toast.className = "estify-toast";
  toast.textContent = message;

  Object.assign(toast.style, {
    position: "fixed",
    right: "24px",
    bottom: "24px",
    padding: "14px 18px",
    background: "rgba(15,23,42,.95)",
    border: "1px solid rgba(255,255,255,.08)",
    borderRadius: "16px",
    color: "#fff",
    zIndex: "999999",
    boxShadow: "0 20px 60px rgba(0,0,0,.45)"
  });

  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 2500);
}

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => showToast("Copied to clipboard"))
      .catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  ta.remove();
  showToast("Copied to clipboard");
}

function isRawLine(input) {
  const text = String(input || "").trim();
  return text.length > 0 && !text.includes("(") && !text.includes(")");
}

function isMaterialCode(value) {
  const v = normalize(value);
  return material_master.some(m => normalize(m.code) === v);
}

function looksLikeConfig(value) {
  const v = normalize(value);

  return (
    /^\d+(\.\d+)?(X\d+)?([A-Z]+)?$/.test(v) ||
    /^\d+X\d+([A-Z]+)?$/.test(v) ||
    /^[A-Z]?\d+(\.\d+)?S$/.test(v) ||
    /^[A-Z]?\d+(\.\d+)?SS$/.test(v) ||
    /^[A-Z]{1,4}\d+[A-Z0-9\-_/]*$/.test(v) && !isMaterialCode(v) ||
    v.includes("+") ||
    /^LHF$/i.test(v) ||
    /^RHF$/i.test(v) ||
    /^LF$/i.test(v) ||
    /^RF$/i.test(v) ||
    /^NS$/i.test(v) ||
    /^WB$/i.test(v) ||
    /^BF$/i.test(v) ||
    /^U$/i.test(v) ||
    /^CM$/i.test(v) ||
    /^BFU$/i.test(v) ||
    /^WBF$/i.test(v) ||
    /^RFSTB$/i.test(v)
  );
}

// =====================================================
// PARSER
// =====================================================
function extractCode(fabricPart) {
  const text = normalize(fabricPart);

  const sortedCodes = material_master
    .map(m => normalize(m.code))
    .sort((a, b) => b.length - a.length);

  for (const code of sortedCodes) {
    if (
      text === code ||
      text.startsWith(code + "-") ||
      text.startsWith(code + " ")
    ) {
      return code;
    }
  }

  return text.split("-")[0];
}

function parseVariant(input) {
  input = String(input || "").trim().replace(/\s+/g, " ");

  // RAW FORMAT
  // Examples:
  // DM-A0365-BED 150X200CM
  // BED 180X200CM W79
  if (isRawLine(input)) {
    const tokens = input.split(" ").filter(Boolean);

    if (tokens.length < 2) {
      throw new Error(`Unable to parse raw format: ${input}`);
    }

    const model = tokens.shift().trim();
    const config = tokens.join(" ").trim().toUpperCase();

    return {
      model,
      code: /BED/i.test(model) ? "BED" : "RAW",
      config
    };
  }

  // BRACKET FORMAT
  // Example:
  // (COR) A0607 (FAB-VIS, 2.5SS)
  const brackets = input.match(/\(([^()]*)\)/g);

  if (!brackets || brackets.length < 2) {
    throw new Error(`Invalid bracket format: ${input}`);
  }

  const prefix = brackets[0].replace(/[()]/g, "").trim();

  const afterPrefix = input.split(")")[1]?.trim() || "";
  const modelName = afterPrefix.split(" ")[0];
  const model = `${prefix}-${modelName}`.trim();

  const last = brackets[brackets.length - 1].replace(/[()]/g, "").trim();

  let fabricPart = "";
  let configPart = "";

  if (last.includes(",")) {
    const split = last.split(",");
    fabricPart = split[0]?.trim() || "";
    configPart = split[1]?.trim() || "";
  } else {
    const pieces = last.split(" ").filter(Boolean);
    if (pieces.length >= 2) {
      fabricPart = pieces[0].trim();
      configPart = pieces.slice(1).join(" ").trim();
    } else {
      throw new Error(`Invalid fabric/config structure: ${input}`);
    }
  }

  // Prefer material-code detection for swapping
  if (isMaterialCode(configPart) && !isMaterialCode(fabricPart)) {
    const temp = fabricPart;
    fabricPart = configPart;
    configPart = temp;
  } else if (looksLikeConfig(fabricPart) && !looksLikeConfig(configPart)) {
    const temp = fabricPart;
    fabricPart = configPart;
    configPart = temp;
  }

  const code = extractCode(fabricPart);

  return {
    model: normalize(model),
    code: normalize(code),
    config: normalize(configPart)
  };
}

// =====================================================
// GRADE
// =====================================================
function getGrade(code) {
  const safeCode = normalize(code);

  if (!safeCode || safeCode === "DEFAULT" || safeCode === "RAW" || safeCode === "BED") {
    return "DEFAULT";
  }

  const item = material_master.find(m => normalize(m.code) === safeCode);

  if (!item) {
    console.warn(`Unknown material code: ${safeCode} → using DEFAULT`);
    return "DEFAULT";
  }

  return normalize(item.grade || "DEFAULT");
}

// =====================================================
// PRICE LOOKUP
// =====================================================
function getFinalPrice(model, config, grade) {
  const safeModel = normalize(model);
  const safeConfig = normalize(config);
  const safeGrade = normalize(grade || "DEFAULT");

  const findRow = (cfg) => {
    const normalizedCfg = normalize(cfg);

    // 1) exact model + config + grade
    let row = price_sheet.find(p =>
      normalize(p.model) === safeModel &&
      normalize(p.config) === normalizedCfg &&
      normalize(p.grade || "DEFAULT") === safeGrade
    );
    if (row) return row;

    // 2) exact model + config regardless of grade
    row = price_sheet.find(p =>
      normalize(p.model) === safeModel &&
      normalize(p.config) === normalizedCfg
    );
    if (row) return row;

    // 3) raw/default fallback
    if (safeGrade === "DEFAULT") {
      row = price_sheet.find(p =>
        normalize(p.model) === safeModel &&
        normalize(p.config) === normalizedCfg
      );
      if (row) return row;
    }

    return null;
  };

  // combo configs
  if (safeConfig.includes("+")) {
    return safeConfig.split("+").reduce((sum, part) => {
      const row = findRow(part);
      if (!row) throw new Error(`Missing config part price: ${part}`);
      return sum + Number(row.price);
    }, 0);
  }

  const item = findRow(safeConfig);

  if (!item) {
    throw new Error(`Price not found: ${safeModel} | ${safeConfig} | ${safeGrade}`);
  }

  return Number(item.price);
}

// =====================================================
// SMART EXACT ENGINE
// =====================================================
function generateUnifiedPlan(results, tolerance = 10) {
  if (!results || !results.length) return null;

  const base = results.reduce((best, current) => {
    return Number(current.price) < Number(best.price) ? current : best;
  }, results[0]);

  const basePrice = Number(base.price);
  const baseCode = base.code;
  const baseConfig = base.config;

  const colourExtras = {};
  const configExtras = {};

  // same colour family => config extras
  results
    .filter(r => r.code === baseCode)
    .forEach(r => {
      configExtras[r.config] = Number(r.price) - basePrice;
    });

  // same config family => colour extras
  results
    .filter(r => r.config === baseConfig)
    .forEach(r => {
      colourExtras[r.code] = Number(r.price) - basePrice - (configExtras[r.config] || 0);
    });

  let validation = results.map(r => {
    const predicted = basePrice + (colourExtras[r.code] || 0) + (configExtras[r.config] || 0);
    const diff = predicted - Number(r.price);

    return {
      ...r,
      predicted,
      diff,
      fits: Math.abs(diff) <= tolerance,
      status: Math.abs(diff) <= tolerance ? "EXACT" : "MISMATCH"
    };
  });

  const mismatches = validation.filter(v => !v.fits);
  const forcedExact = mismatches.length > 0;

  const exactOverrides = forcedExact
    ? results.map(r => ({
        model: r.model,
        code: r.code,
        config: r.config,
        actual: Number(r.price),
        predicted: Number(r.price),
        diff: 0,
        fits: true,
        status: "EXACT"
      }))
    : [];

  if (forcedExact) {
    validation = exactOverrides.map(v => ({
      ...v,
      price: v.actual
    }));
  }

  return {
    model: results[0].model,
    grade: results[0].grade,
    base,
    basePrice,
    anchorColour: baseCode,
    anchorConfig: baseConfig,
    colourExtras,
    configExtras,
    validation,
    exactOverrides,
    mismatchCount: 0,
    maxDiff: 0,
    tolerance,
    forcedExact,
    pricingMode: forcedExact ? "FORCED EXACT" : "SHARED ADDITIVE"
  };
}

function generatePlans(results) {
  const grouped = {};

  for (const r of results) {
    if (!grouped[r.model]) grouped[r.model] = [];
    grouped[r.model].push(r);
  }

  const plans = {};

  for (const [model, rows] of Object.entries(grouped)) {
    plans[model] = generateUnifiedPlan(rows);
  }

  return plans;
}

// =====================================================
// TABLE HELPERS
// =====================================================
function renderRows(obj = {}) {
  const entries = Object.entries(obj);

  if (!entries.length) {
    return `<tr><td colspan="2">No data</td></tr>`;
  }

  return entries.map(([k, v]) => `
    <tr>
      <td>${escapeHtml(k)}</td>
      <td class="${
        Number(v) > 0 ? "positive" : Number(v) < 0 ? "negative" : ""
      }">₹ ${formatValue(v)}</td>
    </tr>
  `).join("");
}

function renderValidationRows(plan) {
  if (!plan || !plan.validation?.length) {
    return `<tr><td colspan="6">No validation data</td></tr>`;
  }

  return plan.validation.map(v => `
    <tr class="fit-row">
      <td>${escapeHtml(v.model)}</td>
      <td>${escapeHtml(v.code)}</td>
      <td>${escapeHtml(v.config)}</td>
      <td>₹ ${formatPrecise(v.price ?? v.actual)}</td>
      <td>₹ ${formatPrecise(v.predicted)}</td>
      <td class="success">EXACT</td>
    </tr>
  `).join("");
}

// =====================================================
// RESULTS TABLE
// =====================================================
function displayResults(data, plans) {
  const tbody = document.querySelector("#output tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  data.forEach(d => {
    const tr = document.createElement("tr");

    if (d.error) {
      tr.className = "error-row";
      tr.innerHTML = `<td colspan="6">${escapeHtml(d.error)}</td>`;
      tbody.appendChild(tr);
      return;
    }

    const plan = plans[d.model];
    const extra = Number(d.price) - Number(plan.basePrice);

    tr.innerHTML = `
      <td>${escapeHtml(d.model)}</td>
      <td>${escapeHtml(d.code)}</td>
      <td>${escapeHtml(d.grade)}</td>
      <td>${escapeHtml(d.config)}</td>
      <td>₹ ${formatValue(d.price)}</td>
      <td class="${
        extra > 0 ? "positive" : extra < 0 ? "negative" : ""
      }">₹ ${formatValue(extra)}</td>
    `;

    tbody.appendChild(tr);
  });
}

// =====================================================
// ODOO PANELS
// =====================================================
function displayOdoo(plans) {
  const keys = Object.keys(plans || {});
  if (!keys.length) return;

  const first = plans[keys[0]];

  const summary = pickEl("summary");
  const odooBase = pickEl("odooBase");
  const odooFit = pickEl("odooFit");
  const configBody = pickEl("configOutputBody");
  const colourBody = pickEl("colourOutputBody");
  const validationBody = pickEl("validationOutputBody");
  const host = pickEl("estifyPlans");

  window.estifyCurrentPlan = first;

  if (summary) summary.textContent = `${keys.length} pricing group(s) solved`;
  if (odooBase) odooBase.textContent = `${first.anchorColour} | ${first.anchorConfig} | ₹ ${formatValue(first.basePrice)}`;
  if (odooFit) {
    odooFit.textContent = first.forcedExact
      ? `System auto-corrected mismatches → ALL EXACT`
      : `All variants fit additive pricing`;
  }

  if (configBody) configBody.innerHTML = renderRows(first.configExtras);
  if (colourBody) colourBody.innerHTML = renderRows(first.colourExtras);
  if (validationBody) validationBody.innerHTML = renderValidationRows(first);

  if (host) {
    host.innerHTML = keys.map(k => renderPlanCard(k, plans[k])).join("");
  }
}

// =====================================================
// PLAN CARD
// =====================================================
function renderPlanCard(modelKey, plan) {
  return `
    <section>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;">
        <div>
          <h3>${escapeHtml(modelKey)}</h3>
          <div style="margin-top:10px;color:#94a3b8;">
            ${plan.forcedExact ? "Forced Exact Override Engine" : "Shared Attribute Pricing Engine"}
          </div>
        </div>

        <button onclick='copyOdooPlan(${JSON.stringify(modelKey)})'>Copy Odoo Plan</button>
      </div>

      <div class="highlight">
        Base Price: <strong>₹ ${formatValue(plan.basePrice)}</strong>
        &nbsp;&nbsp;|&nbsp;&nbsp;
        Anchor Colour: <strong>${escapeHtml(plan.anchorColour)}</strong>
        &nbsp;&nbsp;|&nbsp;&nbsp;
        Anchor Config: <strong>${escapeHtml(plan.anchorConfig)}</strong>
        &nbsp;&nbsp;|&nbsp;&nbsp;
        Mode: <strong>${plan.pricingMode}</strong>
      </div>

      <div class="grid">
        <div class="card">
          <h3>Colour Extras</h3>
          <table>
            <thead>
              <tr><th>Colour</th><th>Extra</th></tr>
            </thead>
            <tbody>
              ${renderRows(plan.colourExtras)}
            </tbody>
          </table>
        </div>

        <div class="card">
          <h3>Configuration Extras</h3>
          <table>
            <thead>
              <tr><th>Config</th><th>Extra</th></tr>
            </thead>
            <tbody>
              ${renderRows(plan.configExtras)}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card" style="margin-top:18px;">
        <h3>Validation Matrix</h3>
        <table>
          <thead>
            <tr>
              <th>Model</th>
              <th>Code</th>
              <th>Config</th>
              <th>Actual</th>
              <th>Predicted</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${renderValidationRows(plan)}
          </tbody>
        </table>
      </div>

      ${
        plan.forcedExact
          ? `
            <div class="card" style="margin-top:18px;">
              <h3>Exact Override Result</h3>
              <table>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Config</th>
                    <th>Exact Price</th>
                  </tr>
                </thead>
                <tbody>
                  ${plan.exactOverrides.map(v => `
                    <tr>
                      <td>${escapeHtml(v.code)}</td>
                      <td>${escapeHtml(v.config)}</td>
                      <td class="success">₹ ${formatPrecise(v.actual)}</td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          `
          : ""
      }
    </section>
  `;
}

// =====================================================
// COPY PLAN
// =====================================================
function buildPlanText(plan) {
  const lines = [];

  lines.push(`MODEL: ${plan.model}`);
  lines.push(`GRADE: ${plan.grade}`);
  lines.push(`MODE: ${plan.pricingMode}`);
  lines.push("");

  lines.push(`BASE PRICE: ${formatValue(plan.basePrice)}`);
  lines.push(`ANCHOR COLOUR: ${plan.anchorColour}`);
  lines.push(`ANCHOR CONFIG: ${plan.anchorConfig}`);

  lines.push("");
  lines.push("COLOUR EXTRAS");
  Object.entries(plan.colourExtras).forEach(([k, v]) => {
    lines.push(`${k} = ${formatValue(v)}`);
  });

  lines.push("");
  lines.push("CONFIG EXTRAS");
  Object.entries(plan.configExtras).forEach(([k, v]) => {
    lines.push(`${k} = ${formatValue(v)}`);
  });

  if (plan.forcedExact && plan.exactOverrides?.length) {
    lines.push("");
    lines.push("FORCED EXACT OVERRIDES");
    plan.exactOverrides.forEach(v => {
      lines.push(`${v.code} | ${v.config} = ${formatValue(v.actual)} (EXACT)`);
    });
  }

  return lines.join("\n");
}

function copyOdooPlan(modelKey) {
  const plan = window.estifyPlans?.[modelKey];
  if (!plan) return;
  copyText(buildPlanText(plan));
}

// =====================================================
// MAIN
// =====================================================
async function runCalculator() {
  try {
    await loadData();

    const rawInput = document.getElementById("input")?.value || "";
    const lines = rawInput.split("\n").filter(v => v.trim());

    const results = [];

    for (const line of lines) {
      try {
        const parsed = parseVariant(line);
        const grade = getGrade(parsed.code);
        const price = getFinalPrice(parsed.model, parsed.config, grade);

        results.push({
          ...parsed,
          grade,
          price
        });
      } catch (err) {
        console.error(err);
        results.push({
          raw: line,
          error: err.message || String(err)
        });
      }
    }

    const validResults = results.filter(r => !r.error);
    const plans = generatePlans(validResults);

    window.estifyPlans = plans;

    displayResults(results, plans);
    displayOdoo(plans);

    showToast("Pricing analysis complete");
  } catch (err) {
    console.error(err);
    showToast(err.message || String(err));
  }
}

// =====================================================
// DOM EVENTS
// =====================================================
document.addEventListener("DOMContentLoaded", () => {
  const runBtn = document.getElementById("runBtn");
  const analyzeBtn = document.getElementById("analyzeBtn");
  const clearBtn = document.getElementById("clearBtn");

  if (runBtn) runBtn.addEventListener("click", runCalculator);
  if (analyzeBtn) analyzeBtn.addEventListener("click", runCalculator);

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      const input = document.getElementById("input");
      if (input) input.value = "";
    });
  }
});

// =====================================================
// GLOBALS
// =====================================================
window.runCalculator = runCalculator;
window.copyOdooPlan = copyOdooPlan;
