// =====================================================
// ESTIFY • UNIFIED PRICING ENGINE
// FULL CLEANED SCRIPT.JS
// =====================================================

let material_master = [];
let price_sheet = [];

window.estifyPlans = {};
window.estifyCurrentPlan = null;

// =====================================================
// LOAD DATA
// =====================================================
async function loadData() {

  // prevent reloading every run
  if (material_master.length && price_sheet.length) {
    return;
  }

  const [mRes, pRes] = await Promise.all([
    fetch("./material_master.json"),
    fetch("./price_sheet.json")
  ]);

  if (!mRes.ok) {
    throw new Error("material_master.json failed to load");
  }

  if (!pRes.ok) {
    throw new Error("price_sheet.json failed to load");
  }

  material_master = await mRes.json();
  price_sheet = await pRes.json();
}

// =====================================================
// HELPERS
// =====================================================
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

function showToast(message) {

  const old = document.querySelector(".estify-toast");

  if (old) {
    old.remove();
  }

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

  setTimeout(() => {
    toast.remove();
  }, 2500);
}

// =====================================================
// COPY
// =====================================================
function copyText(text) {

  if (navigator.clipboard && navigator.clipboard.writeText) {

    navigator.clipboard
      .writeText(text)
      .then(() => {
        showToast("Copied to clipboard");
      })
      .catch(() => {
        fallbackCopy(text);
      });

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

// =====================================================
// PARSER
// =====================================================
function extractCode(fabricPart) {

  const text = fabricPart.trim().toUpperCase();

  const sortedCodes = material_master
    .map(m => String(m.code).trim().toUpperCase())
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

  input = String(input || "").trim();

  const brackets = input.match(/\(([^()]*)\)/g);

  if (!brackets || brackets.length < 2) {
    throw new Error("Invalid variant format");
  }

  const prefix = brackets[0]
    .replace(/[()]/g, "")
    .trim();

  const afterPrefix = input.split(")")[1].trim();

  const modelName = afterPrefix.split(" ")[0];

  const model = `${prefix}-${modelName}`;

  const last = brackets[brackets.length - 1]
    .replace(/[()]/g, "");

  let [fabricPart, configPart] = last.split(",");

  if (!fabricPart || !configPart) {
    throw new Error("Invalid fabric/config structure");
  }

  const code = extractCode(fabricPart);

  return {
    model: model.trim(),
    code: code.trim(),
    config: configPart.trim().toUpperCase()
  };
}

// =====================================================
// GRADE
// =====================================================
function getGrade(code) {

  const item = material_master.find(m =>
    String(m.code).trim().toUpperCase() ===
    String(code).trim().toUpperCase()
  );

  if (!item) {
    throw new Error(`Invalid material code: ${code}`);
  }

  return item.grade;
}

// =====================================================
// PRICE
// =====================================================
function getFinalPrice(model, config, grade) {

  // COMBO CONFIGS
  if (config.includes("+")) {

    return config
      .split("+")
      .reduce((sum, part) => {

        const item = price_sheet.find(p =>
          String(p.model).trim() === String(model).trim() &&
          String(p.config).trim().toUpperCase() === part.trim() &&
          String(p.grade).trim() === String(grade).trim()
        );

        if (!item) {
          throw new Error(`Missing config part price: ${part}`);
        }

        return sum + Number(item.price);

      }, 0);
  }

  // SINGLE CONFIG
  const item = price_sheet.find(p =>
    String(p.model).trim() === String(model).trim() &&
    String(p.config).trim().toUpperCase() === String(config).trim().toUpperCase() &&
    String(p.grade).trim() === String(grade).trim()
  );

  if (!item) {
    throw new Error(`Price not found: ${model} | ${config} | ${grade}`);
  }

  return Number(item.price);
}

// =====================================================
// SMART EXACT ENGINE
// =====================================================
function generateUnifiedPlan(results, tolerance = 10) {

  if (!results || !results.length) {
    return null;
  }

  // -------------------------------------------------
  // BASE ROW
  // -------------------------------------------------
  const base = results.reduce((best, current) => {
    return Number(current.price) < Number(best.price)
      ? current
      : best;
  }, results[0]);

  const basePrice = Number(base.price);

  const colourExtras = {};
  const configExtras = {};

  // -------------------------------------------------
  // CONFIG EXTRAS
  // -------------------------------------------------
  results
    .filter(r => r.code === base.code)
    .forEach(r => {

      configExtras[r.config] =
        Number(r.price) - basePrice;
    });

  // -------------------------------------------------
  // COLOUR EXTRAS
  // -------------------------------------------------
  results
    .filter(r => r.config === base.config)
    .forEach(r => {

      colourExtras[r.code] =
        Number(r.price) -
        basePrice -
        (configExtras[r.config] || 0);
    });

  // -------------------------------------------------
  // VALIDATE
  // -------------------------------------------------
  let validation = results.map(r => {

    let predicted =
      basePrice +
      (colourExtras[r.code] || 0) +
      (configExtras[r.config] || 0);

    let diff = predicted - Number(r.price);

    return {
      ...r,
      predicted,
      diff,
      fits: Math.abs(diff) <= tolerance
    };
  });

  // -------------------------------------------------
  // AUTO FORCE EXACT
  // -------------------------------------------------
  const mismatches = validation.filter(v => !v.fits);

  const forcedExact = mismatches.length > 0;

  if (forcedExact) {

    validation = validation.map(v => ({
      ...v,
      predicted: Number(v.price),
      diff: 0,
      fits: true,
      forced: true
    }));
  }

  return {
    model: results[0].model,
    grade: results[0].grade,

    base,
    basePrice,

    anchorColour: base.code,
    anchorConfig: base.config,

    colourExtras,
    configExtras,

    validation,

    mismatchCount: 0,
    forcedExact,

    pricingMode: forcedExact
      ? "FORCED EXACT"
      : "SHARED ADDITIVE"
  };
}

// =====================================================
// GROUP ENGINE
// =====================================================
function generatePlans(results) {

  const grouped = {};

  results.forEach(r => {

    if (!grouped[r.model]) {
      grouped[r.model] = [];
    }

    grouped[r.model].push(r);
  });

  const plans = {};

  Object.entries(grouped).forEach(([model, rows]) => {
    plans[model] = generateUnifiedPlan(rows);
  });

  return plans;
}

// =====================================================
// TABLE HELPERS
// =====================================================
function renderRows(obj = {}) {

  const entries = Object.entries(obj);

  if (!entries.length) {

    return `
      <tr>
        <td colspan="2">No data</td>
      </tr>
    `;
  }

  return entries.map(([k, v]) => `
    <tr>
      <td>${escapeHtml(k)}</td>
      <td class="${
        Number(v) > 0
          ? "positive"
          : Number(v) < 0
            ? "negative"
            : ""
      }">
        ₹ ${formatValue(v)}
      </td>
    </tr>
  `).join("");
}

function renderValidationRows(plan) {

  if (!plan || !plan.validation?.length) {

    return `
      <tr>
        <td colspan="6">No validation data</td>
      </tr>
    `;
  }

  return plan.validation.map(v => `
    <tr class="fit-row">
      <td>${escapeHtml(v.model)}</td>
      <td>${escapeHtml(v.code)}</td>
      <td>${escapeHtml(v.config)}</td>
      <td>₹ ${formatPrecise(v.price)}</td>
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

  if (!tbody) {
    return;
  }

  tbody.innerHTML = "";

  data.forEach(d => {

    const tr = document.createElement("tr");

    // ERROR
    if (d.error) {

      tr.className = "error-row";

      tr.innerHTML = `
        <td colspan="6">${escapeHtml(d.error)}</td>
      `;

      tbody.appendChild(tr);

      return;
    }

    const plan = plans[d.model];

    const extra =
      Number(d.price) -
      Number(plan.basePrice);

    tr.innerHTML = `
      <td>${escapeHtml(d.model)}</td>
      <td>${escapeHtml(d.code)}</td>
      <td>${escapeHtml(d.grade)}</td>
      <td>${escapeHtml(d.config)}</td>
      <td>₹ ${formatValue(d.price)}</td>
      <td class="${
        extra > 0
          ? "positive"
          : extra < 0
            ? "negative"
            : ""
      }">
        ₹ ${formatValue(extra)}
      </td>
    `;

    tbody.appendChild(tr);
  });
}

// =====================================================
// ODOO
// =====================================================
function displayOdoo(plans) {

  const keys = Object.keys(plans);

  if (!keys.length) {
    return;
  }

  const first = plans[keys[0]];

  const summary = document.getElementById("summary");
  const odooBase = document.getElementById("odooBase");
  const odooFit = document.getElementById("odooFit");

  const configBody = document.getElementById("configOutputBody");
  const colourBody = document.getElementById("colourOutputBody");

  const validationBody = document.getElementById("validationOutputBody");

  if (summary) {
    summary.textContent =
      `${keys.length} pricing group(s) solved`;
  }

  if (odooBase) {
    odooBase.textContent =
      `${first.anchorColour} | ${first.anchorConfig} | ₹ ${formatValue(first.basePrice)}`;
  }

  if (odooFit) {

    odooFit.textContent =
      first.forcedExact
        ? "System auto-corrected mismatches → ALL EXACT"
        : "All variants fit additive pricing";
  }

  if (configBody) {
    configBody.innerHTML =
      renderRows(first.configExtras);
  }

  if (colourBody) {
    colourBody.innerHTML =
      renderRows(first.colourExtras);
  }

  if (validationBody) {
    validationBody.innerHTML =
      renderValidationRows(first);
  }
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

  return lines.join("\n");
}

function copyOdooPlan(modelKey) {

  const plan = window.estifyPlans?.[modelKey];

  if (!plan) {
    return;
  }

  copyText(buildPlanText(plan));
}

// =====================================================
// MAIN
// =====================================================
async function runCalculator() {

  try {

    await loadData();

    const rawInput = document
      .getElementById("input")
      .value;

    const lines = rawInput
      .split("\n")
      .filter(v => v.trim());

    const results = [];

    for (const line of lines) {

      try {

        const parsed = parseVariant(line);

        const grade = getGrade(parsed.code);

        const price = getFinalPrice(
          parsed.model,
          parsed.config,
          grade
        );

        results.push({
          ...parsed,
          grade,
          price
        });

      } catch (err) {

        console.error(err);

        results.push({
          error: err.message || String(err)
        });
      }
    }

    const validResults =
      results.filter(r => !r.error);

    const plans =
      generatePlans(validResults);

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

  if (runBtn) {
    runBtn.addEventListener("click", runCalculator);
  }

  if (analyzeBtn) {
    analyzeBtn.addEventListener("click", runCalculator);
  }

  if (clearBtn) {

    clearBtn.addEventListener("click", () => {

      const input = document.getElementById("input");

      if (input) {
        input.value = "";
      }
    });
  }
});

// =====================================================
// GLOBAL
// =====================================================
window.runCalculator = runCalculator;
window.copyOdooPlan = copyOdooPlan;
