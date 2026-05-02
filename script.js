let material_master = [];
let price_sheet = [];

window.estifyPlans = {};
window.estifyCurrentPlan = null;

// ================================
// LOAD JSON DATA
// ================================
async function loadData() {
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

// ================================
// HELPERS
// ================================
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

function planKey(model) {
  return model.trim();
}

// ================================
// COPY
// ================================
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

function showToast(message) {
  const existing = document.querySelector(".estify-toast");

  if (existing) existing.remove();

  const toast = document.createElement("div");

  toast.className = "estify-toast";
  toast.textContent = message;

  Object.assign(toast.style, {
    position: "fixed",
    right: "24px",
    bottom: "24px",
    padding: "14px 18px",
    borderRadius: "16px",
    background: "rgba(15,23,42,.92)",
    color: "#fff",
    zIndex: "99999",
    border: "1px solid rgba(255,255,255,.08)",
    boxShadow: "0 20px 50px rgba(0,0,0,.45)",
    backdropFilter: "blur(14px)"
  });

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 2200);
}

// ================================
// SMART FABRIC CODE EXTRACTION
// ================================
function extractCode(fabricPart) {
  const text = fabricPart.trim().toUpperCase();

  const sortedCodes = material_master
    .map(m => m.code.trim().toUpperCase())
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

// ================================
// PARSER
// ================================
function parseVariant(input) {
  try {
    input = input
      .replace(/\(\s*\(/g, "(")
      .replace(/\)\s*\)/g, ")");

    const brackets = input.match(/\(([^()]*)\)/g);

    if (!brackets || brackets.length < 2) {
      throw new Error("Invalid format");
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

    configPart = configPart
      .replace(/[()]/g, "")
      .trim()
      .toUpperCase();

    const code = extractCode(fabricPart);

    return {
      model: model.trim(),
      code: code.trim(),
      config: configPart
    };
  } catch (err) {
    console.error("Parsing failed:", input, err);
    throw err;
  }
}

// ================================
// GRADE
// ================================
function getGrade(code) {
  const item = material_master.find(
    m => m.code.trim().toUpperCase() === code.trim().toUpperCase()
  );

  if (!item) {
    throw new Error(`Invalid code: ${code}`);
  }

  return item.grade;
}

// ================================
// PRICE
// ================================
function getFinalPrice(model, config, grade) {
  if (config.includes("+")) {
    return config.split("+").reduce((sum, part) => {
      const item = price_sheet.find(p =>
        p.model.trim() === model.trim() &&
        p.config.trim().toUpperCase() === part.trim() &&
        p.grade.trim() === grade.trim()
      );

      if (!item) {
        throw new Error(`Missing config part price: ${part}`);
      }

      return sum + Number(item.price);
    }, 0);
  }

  const item = price_sheet.find(p =>
    p.model.trim() === model.trim() &&
    p.config.trim().toUpperCase() === config.trim() &&
    p.grade.trim() === grade.trim()
  );

  if (!item) {
    throw new Error(
      `Price not found: ${model} | ${config} | ${grade}`
    );
  }

  return Number(item.price);
}

// ================================
// SHARED ATTRIBUTE ENGINE
// SINGLE PRODUCT TEMPLATE
// ================================
function generateUnifiedPlan(results, tolerance = 10) {
  if (!results.length) return null;

  // GLOBAL BASE
  const base = results.reduce((best, current) => {
    return Number(current.price) < Number(best.price)
      ? current
      : best;
  }, results[0]);

  const basePrice = Number(base.price);

  const colourExtras = {};
  const configExtras = {};

  // ================================
  // CONFIG EXTRAS
  // SAME COLOUR AS BASE
  // ================================
  results
    .filter(r => r.code === base.code)
    .forEach(r => {
      configExtras[r.config] =
        Number(r.price) - basePrice;
    });

  // ================================
  // COLOUR EXTRAS
  // SAME CONFIG AS BASE
  // ================================
  results
    .filter(r => r.config === base.config)
    .forEach(r => {
      colourExtras[r.code] =
        Number(r.price) -
        basePrice -
        (configExtras[r.config] || 0);
    });

  // ================================
  // VALIDATION
  // ================================
  const validation = results.map(r => {
    const predicted =
      basePrice +
      (colourExtras[r.code] || 0) +
      (configExtras[r.config] || 0);

    const diff = predicted - Number(r.price);

    return {
      ...r,
      predicted,
      diff,
      fits: Math.abs(diff) <= tolerance
    };
  });

  // ================================
  // EXACT VARIANT OVERRIDES
  // FOR ODOO
  // ================================
  const overrides = validation
    .filter(v => !v.fits)
    .map(v => ({
      model: v.model,
      code: v.code,
      config: v.config,
      actual: Number(v.price),
      predicted: Number(v.predicted),
      override: Number(v.price)
    }));

  const mismatchCount = overrides.length;

  const maxDiff = validation.length
    ? Math.max(...validation.map(v => Math.abs(v.diff)))
    : 0;

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
    overrides,
    mismatchCount,
    maxDiff,
    tolerance
  };
}

// ================================
// GENERATE PLANS
// ================================
function generateEstifyPlans(results, tolerance = 10) {
  const grouped = {};

  for (const r of results) {
    const key = planKey(r.model);

    if (!grouped[key]) {
      grouped[key] = [];
    }

    grouped[key].push(r);
  }

  const plans = {};

  for (const [key, rows] of Object.entries(grouped)) {
    plans[key] = generateUnifiedPlan(rows, tolerance);
  }

  return plans;
}

// ================================
// COPY ODOO PLAN
// ================================
function buildPlanText(plan) {
  const lines = [];

  lines.push(`MODEL: ${plan.model}`);
  lines.push(`GRADE: ${plan.grade}`);
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

  lines.push("");

  if (plan.overrides.length) {
    lines.push("EXACT VARIANT OVERRIDES");

    plan.overrides.forEach(v => {
      lines.push(
        `${v.code} | ${v.config} = ${formatValue(v.override)}`
      );
    });
  } else {
    lines.push("NO OVERRIDES REQUIRED");
  }

  return lines.join("\n");
}

function copyOdooPlan(modelKey) {
  const plan = window.estifyPlans?.[modelKey];

  if (!plan) return;

  copyText(buildPlanText(plan));
}

// ================================
// MAIN
// ================================
async function runCalculator() {
  try {
    await loadData();

    const inputText = document.getElementById("input").value;

    const lines = inputText
      .split("\n")
      .filter(l => l.trim() !== "");

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
        console.error("Line failed:", line, err);

        results.push({
          raw: line,
          error: String(err.message || err)
        });
      }
    }

    const validResults = results.filter(r => !r.error);

    const plansByModel = generateEstifyPlans(validResults);

    window.estifyPlans = plansByModel;

    displayResults(results, plansByModel);

    displayOdoo(plansByModel);

    showToast("Pricing analysis complete");

  } catch (err) {
    console.error(err);

    showToast(err.message || String(err));
  }
}

// ================================
// RESULTS TABLE
// ================================
function displayResults(data, plansByModel) {
  const tbody = document.querySelector("#output tbody");

  if (!tbody) return;

  tbody.innerHTML = "";

  data.forEach(d => {
    const tr = document.createElement("tr");

    if (d.error) {
      tr.classList.add("error-row");

      tr.innerHTML = `
        <td colspan="6">${escapeHtml(d.error)}</td>
      `;

      tbody.appendChild(tr);

      return;
    }

    const key = planKey(d.model);

    const plan = plansByModel[key];

    const extra =
      Number(d.price) -
      Number(plan.basePrice);

    const validation = plan.validation.find(v =>
      v.code === d.code &&
      v.config === d.config
    );

    if (validation?.fits) {
      tr.classList.add("fit-row");
    }

    if (!validation?.fits) {
      tr.classList.add("mismatch-row");
    }

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

// ================================
// TABLE RENDERERS
// ================================
function renderRowsFromEntries(obj) {
  const entries = Object.entries(obj || {});

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
  return plan.validation.map(v => `
    <tr class="${
      v.fits
        ? "fit-row"
        : "mismatch-row"
    }">
      <td>${escapeHtml(v.model)}</td>
      <td>${escapeHtml(v.code)}</td>
      <td>${escapeHtml(v.config)}</td>
      <td>₹ ${formatPrecise(v.price)}</td>
      <td>₹ ${formatPrecise(v.predicted)}</td>
      <td class="${
        v.fits
          ? "success"
          : "danger"
      }">
        ${
          v.fits
            ? "EXACT"
            : `+${formatPrecise(v.diff)}`
        }
      </td>
    </tr>
  `).join("");
}

// ================================
// ODOO PANELS
// ================================
function displayOdoo(plansByModel) {
  const summary = pickEl("summary");

  const odooBase = pickEl("odooBase");

  const odooFit = pickEl("odooFit");

  const colourBody = pickEl("colourOutputBody");

  const configBody = pickEl("configOutputBody");

  const validationBody = pickEl("validationOutputBody");

  const host = pickEl("estifyPlans");

  const modelKeys = Object.keys(plansByModel || {});

  if (!modelKeys.length) {
    return;
  }

  const firstPlan = plansByModel[modelKeys[0]];

  window.estifyCurrentPlan = firstPlan;

  summary.textContent =
    `${modelKeys.length} pricing group(s) solved`;

  odooBase.textContent =
    `Base Variant → ${firstPlan.base.code} | ${firstPlan.base.config} | ₹ ${formatValue(firstPlan.basePrice)}`;

  odooFit.textContent =
    firstPlan.mismatchCount === 0
      ? "All variants fit additive pricing."
      : `${firstPlan.mismatchCount} exact variant override(s) required`;

  colourBody.innerHTML =
    renderRowsFromEntries(firstPlan.colourExtras);

  configBody.innerHTML =
    renderRowsFromEntries(firstPlan.configExtras);

  validationBody.innerHTML =
    renderValidationRows(firstPlan);

  host.innerHTML = modelKeys
    .map(k => renderPlanCard(k, plansByModel[k]))
    .join("");
}

// ================================
// PLAN CARD
// ================================
function renderPlanCard(modelKey, plan) {
  return `
    <section>
      <div style="
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:16px;
        flex-wrap:wrap;
      ">
        <div>
          <h3>${escapeHtml(modelKey)}</h3>

          <div style="
            margin-top:10px;
            color:#94a3b8;
          ">
            Shared Attribute Pricing + Exact Variant Override Engine
          </div>
        </div>

        <button onclick='copyOdooPlan(${JSON.stringify(modelKey)})'>
          Copy Odoo Plan
        </button>
      </div>

      <div class="highlight">
        Base Price:
        <strong>₹ ${formatValue(plan.basePrice)}</strong>

        &nbsp;&nbsp;|&nbsp;&nbsp;

        Anchor Colour:
        <strong>${escapeHtml(plan.anchorColour)}</strong>

        &nbsp;&nbsp;|&nbsp;&nbsp;

        Anchor Config:
        <strong>${escapeHtml(plan.anchorConfig)}</strong>

        &nbsp;&nbsp;|&nbsp;&nbsp;

        Overrides:
        <strong>${plan.overrides.length}</strong>
      </div>

      <div class="grid">
        <div class="card">
          <h3>Colour Extras</h3>

          <table>
            <thead>
              <tr>
                <th>Colour</th>
                <th>Extra</th>
              </tr>
            </thead>

            <tbody>
              ${renderRowsFromEntries(plan.colourExtras)}
            </tbody>
          </table>
        </div>

        <div class="card">
          <h3>Configuration Extras</h3>

          <table>
            <thead>
              <tr>
                <th>Config</th>
                <th>Extra</th>
              </tr>
            </thead>

            <tbody>
              ${renderRowsFromEntries(plan.configExtras)}
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
        plan.overrides.length
          ? `
            <div class="card" style="margin-top:18px;">
              <h3>Exact Variant Overrides Required</h3>

              <table>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Config</th>
                    <th>Actual Price</th>
                    <th>Predicted</th>
                  </tr>
                </thead>

                <tbody>
                  ${plan.overrides.map(v => `
                    <tr>
                      <td>${escapeHtml(v.code)}</td>
                      <td>${escapeHtml(v.config)}</td>
                      <td class="success">
                        ₹ ${formatPrecise(v.actual)}
                      </td>
                      <td class="danger">
                        ₹ ${formatPrecise(v.predicted)}
                      </td>
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

// ================================
// EXPOSE
// ================================
window.runCalculator = runCalculator;
window.copyOdooPlan = copyOdooPlan;
