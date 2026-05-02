let material_master = [];
let price_sheet = [];

window.estifyPlans = {};

// =============================
// LOAD DATA
// =============================
async function loadData() {
  const [mRes, pRes] = await Promise.all([
    fetch('./material_master.json'),
    fetch('./price_sheet.json')
  ]);

  if (!mRes.ok) {
    throw new Error('material_master.json failed');
  }

  if (!pRes.ok) {
    throw new Error('price_sheet.json failed');
  }

  material_master = await mRes.json();
  price_sheet = await pRes.json();
}

// =============================
// HELPERS
// =============================
function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function formatValue(v) {
  const n = Number(v);

  return Number.isFinite(n)
    ? new Intl.NumberFormat('en-IN').format(Math.round(n))
    : '—';
}

function formatPrecise(v) {
  const n = Number(v);

  return Number.isFinite(n)
    ? new Intl.NumberFormat('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(n)
    : '—';
}

function showToast(message) {
  const existing = document.querySelector('.estify-toast');

  if (existing) {
    existing.remove();
  }

  const toast = document.createElement('div');

  toast.className = 'estify-toast';
  toast.textContent = message;

  Object.assign(toast.style, {
    position: 'fixed',
    right: '24px',
    bottom: '24px',
    padding: '14px 18px',
    background: '#0f172a',
    border: '1px solid rgba(255,255,255,.08)',
    borderRadius: '16px',
    color: '#fff',
    zIndex: '9999'
  });

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 2200);
}

// =============================
// PARSER
// =============================
function extractCode(fabricPart) {
  const text = fabricPart.trim().toUpperCase();

  const sortedCodes = material_master
    .map(m => m.code.trim().toUpperCase())
    .sort((a, b) => b.length - a.length);

  for (const code of sortedCodes) {
    if (
      text === code ||
      text.startsWith(code + '-') ||
      text.startsWith(code + ' ')
    ) {
      return code;
    }
  }

  return text.split('-')[0];
}

function parseVariant(input) {
  const brackets = input.match(/\(([^()]*)\)/g);

  if (!brackets || brackets.length < 2) {
    throw new Error('Invalid format');
  }

  const prefix = brackets[0]
    .replace(/[()]/g, '')
    .trim();

  const afterPrefix = input.split(')')[1].trim();

  const modelName = afterPrefix.split(' ')[0];

  const model = `${prefix}-${modelName}`;

  const last = brackets[brackets.length - 1]
    .replace(/[()]/g, '');

  let [fabricPart, configPart] = last.split(',');

  if (!fabricPart || !configPart) {
    throw new Error('Invalid variant structure');
  }

  const code = extractCode(fabricPart);

  return {
    model: model.trim(),
    code: code.trim(),
    config: configPart.trim().toUpperCase()
  };
}

function getGrade(code) {
  const item = material_master.find(m =>
    m.code.trim().toUpperCase() === code.trim().toUpperCase()
  );

  if (!item) {
    throw new Error(`Invalid code: ${code}`);
  }

  return item.grade;
}

function getFinalPrice(model, config, grade) {
  if (config.includes('+')) {
    return config.split('+').reduce((sum, part) => {
      const item = price_sheet.find(p =>
        p.model.trim() === model.trim() &&
        p.config.trim().toUpperCase() === part.trim() &&
        p.grade.trim() === grade.trim()
      );

      if (!item) {
        throw new Error(`Missing config part: ${part}`);
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
    throw new Error(`Price not found: ${model}`);
  }

  return Number(item.price);
}

// =============================
// ENGINE
// =============================
function generateUnifiedPlan(results, tolerance = 10) {
  const base = results.reduce((best, current) => {
    return Number(current.price) < Number(best.price)
      ? current
      : best;
  }, results[0]);

  const basePrice = Number(base.price);

  const colourExtras = {};
  const configExtras = {};

  results
    .filter(r => r.code === base.code)
    .forEach(r => {
      configExtras[r.config] = Number(r.price) - basePrice;
    });

  results
    .filter(r => r.config === base.config)
    .forEach(r => {
      colourExtras[r.code] =
        Number(r.price) -
        basePrice -
        (configExtras[r.config] || 0);
    });

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

  const overrides = validation.filter(v => !v.fits);

  return {
    model: results[0].model,
    grade: results[0].grade,
    basePrice,
    anchorColour: base.code,
    anchorConfig: base.config,
    colourExtras,
    configExtras,
    validation,
    overrides,
    mismatchCount: overrides.length,
    base
  };
}

function generatePlans(results) {
  const grouped = {};

  for (const r of results) {
    if (!grouped[r.model]) {
      grouped[r.model] = [];
    }

    grouped[r.model].push(r);
  }

  const plans = {};

  Object.entries(grouped).forEach(([k, rows]) => {
    plans[k] = generateUnifiedPlan(rows);
  });

  return plans;
}

// =============================
// RENDERERS
// =============================
function renderRows(obj) {
  return Object.entries(obj).map(([k, v]) => `
    <tr>
      <td>${escapeHtml(k)}</td>
      <td>₹ ${formatValue(v)}</td>
    </tr>
  `).join('');
}

function renderValidationRows(plan) {
  return plan.validation.map(v => `
    <tr class="${v.fits ? 'fit-row' : 'mismatch-row'}">
      <td>${escapeHtml(v.model)}</td>
      <td>${escapeHtml(v.code)}</td>
      <td>${escapeHtml(v.config)}</td>
      <td>₹ ${formatPrecise(v.price)}</td>
      <td>₹ ${formatPrecise(v.predicted)}</td>
      <td class="${v.fits ? 'success' : 'danger'}">
        ${v.fits ? 'EXACT' : 'OVERRIDE'}
      </td>
    </tr>
  `).join('');
}

function displayResults(data, plans) {
  const tbody = document.querySelector('#output tbody');

  tbody.innerHTML = '';

  data.forEach(d => {
    const tr = document.createElement('tr');

    if (d.error) {
      tr.className = 'error-row';

      tr.innerHTML = `
        <td colspan="6">${escapeHtml(d.error)}</td>
      `;

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
      <td>${extra >= 0 ? '+' : ''}${formatValue(extra)}</td>
    `;

    tbody.appendChild(tr);
  });
}

function displayOdoo(plans) {
  const keys = Object.keys(plans);

  if (!keys.length) return;

  const first = plans[keys[0]];

  document.getElementById('summary').textContent =
    `${keys.length} pricing groups solved`;

  document.getElementById('odooBase').textContent =
    `${first.anchorColour} | ${first.anchorConfig} | ₹ ${formatValue(first.basePrice)}`;

  document.getElementById('odooFit').textContent =
    first.mismatchCount === 0
      ? 'All variants fit additive pricing'
      : `${first.mismatchCount} exact override(s) required`;

  document.getElementById('configOutputBody').innerHTML =
    renderRows(first.configExtras);

  document.getElementById('colourOutputBody').innerHTML =
    renderRows(first.colourExtras);

  document.getElementById('validationOutputBody').innerHTML =
    renderValidationRows(first);
}

// =============================
// MAIN
// =============================
async function runCalculator() {
  try {
    await loadData();

    const input = document
      .getElementById('input')
      .value
      .split('\n')
      .filter(v => v.trim());

    const results = [];

    for (const line of input) {
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
        results.push({
          error: err.message
        });
      }
    }

    const valid = results.filter(r => !r.error);

    const plans = generatePlans(valid);

    window.estifyPlans = plans;

    displayResults(results, plans);

    displayOdoo(plans);

    showToast('Pricing analysis complete');

  } catch (err) {
    console.error(err);
    showToast(err.message);
  }
}

// =============================
// DOM EVENTS
// =============================
document.addEventListener('DOMContentLoaded', () => {

  document
    .getElementById('runBtn')
    .addEventListener('click', runCalculator);

  document
    .getElementById('analyzeBtn')
    .addEventListener('click', runCalculator);

  document
    .getElementById('clearBtn')
    .addEventListener('click', () => {
      document.getElementById('input').value = '';
    });

});

// GLOBAL FALLBACK
window.runCalculator = runCalculator;
