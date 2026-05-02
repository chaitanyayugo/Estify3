// ================= ODOO ENGINE (SINGLE TEMPLATE + VARIANT OVERRIDES) =================
//
// IMPORTANT:
// - "Exclude for" is NOT a pricing system.
// - It only hides incompatible combinations.
// - Shared attribute extras are used where they fit.
// - Exact PE / FAB-VIS differences are exported as variant pricelist overrides.
//
// This lets you keep ONE product template for the model
// while still carrying exact final prices per variant.

function generateUnifiedOdooPricing(results, tolerance = 10) {
  if (!results || results.length === 0) return null;

  const sorted = [...results].sort((a, b) => Number(a.price) - Number(b.price));
  const base = sorted[0];
  const basePrice = Number(base.price);
  const baseCode = base.code;
  const baseConfig = base.config;

  const colourExtras = {};
  const configExtras = {};

  // Shared colour extras are anchored to the cheapest variant.
  results
    .filter(r => r.config === baseConfig)
    .forEach(r => {
      if (!(r.code in colourExtras)) {
        colourExtras[r.code] = Number(r.price) - basePrice;
      }
    });

  // Shared configuration extras are anchored to the cheapest variant.
  results
    .filter(r => r.code === baseCode)
    .forEach(r => {
      if (!(r.config in configExtras)) {
        configExtras[r.config] = Number(r.price) - basePrice;
      }
    });

  const validation = results.map(r => {
    const predicted =
      basePrice +
      (colourExtras[r.code] ?? 0) +
      (configExtras[r.config] ?? 0);

    const diff = predicted - Number(r.price);

    return {
      ...r,
      predicted,
      diff,
      fits: Math.abs(diff) <= tolerance
    };
  });

  const mismatchCount = validation.filter(v => !v.fits).length;
  const maxDiff = validation.length
    ? Math.max(...validation.map(v => Math.abs(v.diff)))
    : 0;

  const variantOverrides = results.map(r => ({
    model: r.model,
    code: r.code,
    config: r.config,
    exactPrice: Number(r.price)
  }));

  return {
    model: base.model,
    grade: base.grade,
    base,
    basePrice,
    anchorColour: baseCode,
    anchorConfig: baseConfig,
    colourExtras,
    configExtras,
    validation,
    mismatchCount,
    maxDiff,
    tolerance,

    // This is the safe output for Odoo when one shared attribute extra
    // cannot represent two different prices.
    pricingMode:
      mismatchCount === 0
        ? "shared_template_only"
        : "shared_template_plus_variant_overrides",

    variantOverrides,

    // Kept intentionally empty because "Exclude for" is for incompatibility,
    // not for assigning price differences.
    excludeFor: []
  };
}

function generateEstifyPlans(results, tolerance = 10) {
  const grouped = {};

  // One plan per model template.
  for (const r of results) {
    const key = r.model.trim();
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(r);
  }

  const plans = {};

  for (const [modelKey, rows] of Object.entries(grouped)) {
    const plan = generateUnifiedOdooPricing(rows, tolerance);
    if (plan) {
      plan.groupKey = modelKey;
    }
    plans[modelKey] = plan;
  }

  return plans;
}

// ================= COPY HELPERS =================
function buildPlanText(plan) {
  if (!plan || plan.error) {
    return plan?.error || "No plan available";
  }

  const lines = [];
  lines.push(`MODEL: ${plan.model}`);
  lines.push(`GRADE: ${plan.grade}`);
  lines.push(`BASE PRICE: ${formatValue(plan.basePrice)}`);
  lines.push(`ANCHOR COLOUR: ${plan.anchorColour}`);
  lines.push(`ANCHOR CONFIG: ${plan.anchorConfig}`);
  lines.push(`BASE VARIANT: ${plan.base.model} | ${plan.base.code} | ${plan.base.config}`);
  lines.push(`PRICING MODE: ${plan.pricingMode}`);
  lines.push("");

  lines.push("SHARED COLOUR EXTRAS:");
  Object.entries(plan.colourExtras).forEach(([k, v]) => {
    lines.push(`${k} = ${formatValue(v)}`);
  });

  lines.push("");
  lines.push("SHARED CONFIG EXTRAS:");
  Object.entries(plan.configExtras).forEach(([k, v]) => {
    lines.push(`${k} = ${formatValue(v)}`);
  });

  lines.push("");
  lines.push("VARIANT PRICE OVERRIDES:");
  plan.variantOverrides.forEach(v => {
    lines.push(`${v.model} | ${v.code} | ${v.config} = ${formatValue(v.exactPrice)}`);
  });

  if (plan.excludeFor && plan.excludeFor.length) {
    lines.push("");
    lines.push("EXCLUDE FOR (incompatibility only):");
    plan.excludeFor.forEach(row => {
      lines.push(JSON.stringify(row));
    });
  }

  return lines.join("\n");
}

function copyOdooPlan(modelKey) {
  const plan = window.estifyPlans?.[modelKey];
  if (!plan) return;
  copyText(buildPlanText(plan));
}

// ================= DISPLAY HELPERS (MODEL-LEVEL PLAN LOOKUP) =================
function displayResults(data, plansByModel) {
  const tbody = document.querySelector("#output tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  data.forEach(d => {
    const tr = document.createElement("tr");

    if (d.error) {
      tr.classList.add("error-row");
      tr.innerHTML = `
        <td>${escapeHtml(d.raw || "—")}</td>
        <td>—</td>
        <td>—</td>
        <td>—</td>
        <td>${escapeHtml(d.error)}</td>
        <td>—</td>
      `;
      tbody.appendChild(tr);
      return;
    }

    const plan = plansByModel?.[d.model];
    const base = plan && !plan.error ? Number(plan.basePrice) : null;
    const extra = base === null ? null : Number(d.price) - base;

    const validation = plan?.validation?.find(v =>
      v.model === d.model &&
      v.code === d.code &&
      v.config === d.config
    );

    if (validation) {
      tr.classList.add(validation.fits ? "fit-row" : "mismatch-row");
    }

    if (base !== null && Math.abs(Number(d.price) - base) < 0.000001) {
      tr.classList.add("base-row");
    }

    const extraClass = d.error
      ? ""
      : Number(extra) === 0
        ? "extra-zero"
        : Number(extra) > 0
          ? "extra-positive"
          : "extra-negative";

    tr.innerHTML = `
      <td>${escapeHtml(d.model)}</td>
      <td>${escapeHtml(d.code)}</td>
      <td>${escapeHtml(d.grade)}</td>
      <td>${escapeHtml(d.config)}</td>
      <td>${formatValue(d.price)}</td>
      <td class="${extraClass}">${formatValue(extra)}</td>
    `;

    tbody.appendChild(tr);
  });
}

function renderEstifyCard(modelKey, plan) {
  const displayTitle = escapeHtml(modelKey);

  if (!plan || plan.error) {
    return `
      <section style="margin-top:20px;padding:16px;border-radius:14px;background:#020617;border:1px solid #334155;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
          <h3 style="margin:0;color:#38bdf8;">${displayTitle}</h3>
        </div>
        <div style="margin-top:10px;color:#fca5a5;font-weight:600;">
          ${escapeHtml(plan?.error || "No plan available")}
        </div>
      </section>
    `;
  }

  return `
    <section style="margin-top:20px;padding:16px;border-radius:14px;background:#020617;border:1px solid #334155;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
        <h3 style="margin:0;color:#38bdf8;">${displayTitle}</h3>
        <button onclick='copyOdooPlan(${JSON.stringify(modelKey)})'>Copy Odoo Plan</button>
      </div>

      <div class="highlight" style="margin-top:12px;">
        Base: <strong>${formatValue(plan.basePrice)}</strong>
        &nbsp;|&nbsp; Anchor Colour: <strong>${escapeHtml(plan.anchorColour)}</strong>
        &nbsp;|&nbsp; Anchor Config: <strong>${escapeHtml(plan.anchorConfig)}</strong>
        &nbsp;|&nbsp; Status: <strong>${plan.mismatchCount === 0 ? "Exact" : `Mismatch ${plan.mismatchCount}`}</strong>
      </div>

      <div class="grid" style="margin-top:16px;">
        <div class="card">
          <h3>Colour Extras</h3>
          <table>
            <thead>
              <tr><th>Colour</th><th>Extra</th></tr>
            </thead>
            <tbody>
              ${renderRowsFromEntries(plan.colourExtras, "colour")}
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
              ${renderRowsFromEntries(plan.configExtras, "configuration")}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card" style="margin-top:16px;">
        <h3>Variant Price Overrides</h3>
        <table>
          <thead>
            <tr>
              <th>Model</th>
              <th>Code</th>
              <th>Config</th>
              <th>Exact Price</th>
            </tr>
          </thead>
          <tbody>
            ${plan.variantOverrides.map(v => `
              <tr>
                <td>${escapeHtml(v.model)}</td>
                <td>${escapeHtml(v.code)}</td>
                <td>${escapeHtml(v.config)}</td>
                <td>${formatValue(v.exactPrice)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>

      <div class="card" style="margin-top:16px;">
        <h3>Validation</h3>
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
    </section>
  `;
}

function displayOdoo(plansByModel) {
  const summary = pickEl("summary");
  const odooBase = pickEl("odooBase", "baseInfo");
  const odooFit = pickEl("odooFit");

  const colourBody = pickEl("colourOutputBody", "colourTable");
  const configBody = pickEl("configOutputBody", "configTable");
  const validationBody = pickEl("validationOutputBody", "validationTable");

  const modelKeys = Object.keys(plansByModel || {});

  if (!modelKeys.length) {
    if (summary) summary.textContent = "No valid rows found.";
    if (odooBase) odooBase.textContent = "";
    if (odooFit) odooFit.textContent = "";
    if (colourBody) colourBody.innerHTML = "";
    if (configBody) configBody.innerHTML = "";
    if (validationBody) validationBody.innerHTML = "";
    const host = document.getElementById("estifyPlans");
    if (host) host.innerHTML = "";
    window.estifyCurrentPlan = null;
    return;
  }

  const firstValidPlan = modelKeys
    .map(k => plansByModel[k])
    .find(p => p && !p.error) || plansByModel[modelKeys[0]];

  window.estifyCurrentPlan = firstValidPlan || null;

  if (summary) {
    summary.textContent = `Solved ${modelKeys.length} pricing group(s).`;
  }

  if (odooBase) {
    odooBase.textContent = firstValidPlan && !firstValidPlan.error
      ? `Base variant: ${firstValidPlan.base.model} | ${firstValidPlan.base.code} | ${firstValidPlan.base.config} | Base price: ${formatValue(firstValidPlan.basePrice)} | Grade: ${firstValidPlan.grade}`
      : firstValidPlan?.error || "No solved base available.";
  }

  if (odooFit) {
    if (firstValidPlan && !firstValidPlan.error) {
      odooFit.textContent =
        firstValidPlan.mismatchCount === 0
          ? `All valid rows fit the shared Odoo model within tolerance ±${firstValidPlan.tolerance}.`
          : `${firstValidPlan.mismatchCount} row(s) exceed tolerance ±${firstValidPlan.tolerance}. Max diff: ${formatPrecise(firstValidPlan.maxDiff)}. Use variant pricelist overrides for the mismatches.`;
    } else {
      odooFit.textContent = "No solved attribute values available.";
    }
  }

  if (colourBody) {
    colourBody.innerHTML = firstValidPlan && !firstValidPlan.error
      ? renderRowsFromEntries(firstValidPlan.colourExtras, "colour")
      : `<tr><td colspan="2">${escapeHtml(firstValidPlan?.error || "No colour extras")}</td></tr>`;
  }

  if (configBody) {
    configBody.innerHTML = firstValidPlan && !firstValidPlan.error
      ? renderRowsFromEntries(firstValidPlan.configExtras, "configuration")
      : `<tr><td colspan="2">${escapeHtml(firstValidPlan?.error || "No configuration extras")}</td></tr>`;
  }

  if (validationBody) {
    validationBody.innerHTML = renderValidationRows(firstValidPlan);
  }

  let host = document.getElementById("estifyPlans");
  if (!host) {
    host = document.createElement("div");
    host.id = "estifyPlans";
    host.style.marginTop = "24px";
    document.body.appendChild(host);
  }

  host.innerHTML = modelKeys
    .map(modelKey => renderEstifyCard(modelKey, plansByModel[modelKey]))
    .join("");
}

// ================= EXPOSE =================
window.generateEstifyPlans = generateEstifyPlans;
window.copyOdooPlan = copyOdooPlan;
