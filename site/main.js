// The landing page's three small behaviours: copying the starter prompt, saying how wide Rome
// would be on the time scale at the width it is drawn, and drawing the bars of how much is known.

for (const button of document.querySelectorAll('[data-copy]')) {
  const text = document.getElementById(button.dataset.copy);
  const label = button.textContent;
  let timer;
  button.addEventListener('click', () => {
    const done = (message) => {
      button.textContent = message;
      clearTimeout(timer);
      timer = setTimeout(() => (button.textContent = label), 2400);
    };
    const select = () => {
      const range = document.createRange();
      range.selectNodeContents(text);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      done('Selected');
    };
    if (!navigator.clipboard) return select();
    navigator.clipboard.writeText(text.textContent.trim()).then(() => done('Copied'), select);
  });
}

for (const out of document.querySelectorAll('[data-sliver]')) {
  const line = document.getElementById(out.dataset.of);
  const fraction = Number(out.dataset.years) / (Number(out.dataset.spanMa) * 1e6);
  const show = () => {
    const px = line.getBoundingClientRect().width * fraction;
    if (px > 0) out.textContent = `${px.toPrecision(2)} px`;
  };
  show();
  if ('ResizeObserver' in window) new ResizeObserver(show).observe(line);
}

// How much is known: a bar for each share the latest build counts (core/glance.ts), from glance.json, which the site
// puts beside this page. Without it, the section stays hidden.
const glance = document.getElementById('glance');
if (glance && 'fetch' in window) {
  fetch('glance.json')
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then(({ build, glance: g }) => {
      const el = (tag, cls, text) => {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text !== undefined) e.textContent = text;
        return e;
      };
      const percent = (x) => (x === 0 ? '0%' : x < 0.01 ? '<1%' : x > 0.99 && x < 1 ? '>99%' : `${Math.round(x * 100)}%`);
      const ledger = glance.querySelector('[data-glance]');
      for (const group of g.groups) {
        const box = el('div');
        box.append(el('h3', '', group.label));
        const list = el('ol');
        for (const row of group.rows) {
          const li = el('li', row.share === null ? 'unmeasured' : '');
          const bar = el('div', 'bar');
          bar.setAttribute('aria-hidden', 'true');
          if (row.share !== null) {
            const fill = el('span');
            fill.style.width = `${row.share * 100}%`;
            bar.append(fill);
          }
          li.append(el('span', 'label', row.label), el('span', 'value', row.share === null ? '–' : percent(row.share)), bar, el('span', 'of', row.of));
          list.append(li);
        }
        box.append(list);
        ledger.append(box);
      }
      const id = glance.querySelector('[data-glance-build]');
      if (id) id.textContent = `build ${String(build).slice(0, 8)}`;
      glance.hidden = false;
    })
    .catch(() => {});
}
