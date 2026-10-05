// Lijngrafiek voor gewicht (SVG, zonder externe bibliotheek), met aanraak-tooltip.

import { esc, fmt1, fmtDateShort, parseDate } from './util.js';

const NS = 'http://www.w3.org/2000/svg';

function niceStep(range, target) {
  const raw = range / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return step * mag;
}

// points: [{date:'YYYY-MM-DD', kg}] oplopend op datum.
export function weightChart(container, points) {
  container.innerHTML = '';
  if (points.length < 2) {
    container.innerHTML = `<p class="empty">${points.length ? 'Nog één meting. Na je volgende weging verschijnt hier de grafiek.' : 'Nog geen metingen in deze periode.'}</p>`;
    return;
  }

  const width = Math.max(280, container.clientWidth || 340);
  const height = 220;
  const m = { top: 16, right: 14, bottom: 26, left: 40 };
  const iw = width - m.left - m.right;
  const ih = height - m.top - m.bottom;

  const times = points.map((p) => parseDate(p.date).getTime());
  const t0 = times[0];
  const t1 = times.at(-1);
  const kgs = points.map((p) => p.kg);
  let lo = Math.min(...kgs);
  let hi = Math.max(...kgs);
  if (hi - lo < 1) {
    const mid = (hi + lo) / 2;
    lo = mid - 0.5;
    hi = mid + 0.5;
  }
  const step = niceStep(hi - lo, 4);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;

  const x = (t) => m.left + (t1 === t0 ? iw / 2 : ((t - t0) / (t1 - t0)) * iw);
  const y = (kg) => m.top + ih - ((kg - lo) / (hi - lo)) * ih;

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  svg.setAttribute('class', 'chart');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Gewicht van ${fmtDateShort(points[0].date)} tot ${fmtDateShort(points.at(-1).date)}`);

  let s = '';
  // Rasterlijnen + y-as labels
  for (let v = lo; v <= hi + 1e-9; v += step) {
    const yy = y(v).toFixed(1);
    s += `<line class="grid" x1="${m.left}" x2="${width - m.right}" y1="${yy}" y2="${yy}"/>`;
    s += `<text class="tick" x="${m.left - 8}" y="${yy}" text-anchor="end" dominant-baseline="middle">${fmt1(v)}</text>`;
  }
  // X-as labels: begin, midden, eind
  const xTicks = [points[0], points[Math.floor(points.length / 2)], points.at(-1)];
  const sameYear = points[0].date.slice(0, 4) === points.at(-1).date.slice(0, 4);
  xTicks.forEach((p, i) => {
    const anchor = i === 0 ? 'start' : i === 2 ? 'end' : 'middle';
    s += `<text class="tick" x="${x(parseDate(p.date).getTime()).toFixed(1)}" y="${height - 6}" text-anchor="${anchor}">${esc(fmtDateShort(p.date, !sameYear))}</text>`;
  });

  // Vlak + lijn
  const pts = points.map((p, i) => [x(times[i]), y(p.kg)]);
  const line = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join('');
  const area = `${line}L${pts.at(-1)[0].toFixed(1)},${m.top + ih}L${pts[0][0].toFixed(1)},${m.top + ih}Z`;
  s += `<path class="area" d="${area}"/>`;
  s += `<path class="line" d="${line}"/>`;
  // Punten alleen tonen als ze niet te dicht op elkaar staan
  if (points.length <= 40) {
    pts.forEach(([px, py]) => (s += `<circle class="dot" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4"/>`));
  } else {
    const [px, py] = pts.at(-1);
    s += `<circle class="dot" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4"/>`;
  }
  // Laatste waarde direct labelen
  const [lx, ly] = pts.at(-1);
  s += `<text class="end-label" x="${(lx - 8).toFixed(1)}" y="${(ly - 12).toFixed(1)}" text-anchor="end">${fmt1(kgs.at(-1))} kg</text>`;
  // Crosshair (verborgen tot aanraken)
  s += `<g class="hover" visibility="hidden"><line class="cross" y1="${m.top}" y2="${m.top + ih}"/><circle class="hover-dot" r="5"/></g>`;
  svg.innerHTML = s;

  const wrap = document.createElement('div');
  wrap.className = 'chart-wrap';
  const tip = document.createElement('div');
  tip.className = 'tooltip';
  tip.hidden = true;
  wrap.append(svg, tip);
  container.append(wrap);

  const hover = svg.querySelector('.hover');
  const cross = svg.querySelector('.cross');
  const hdot = svg.querySelector('.hover-dot');

  const show = (clientX) => {
    const rect = svg.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * width;
    let best = 0;
    for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i][0] - px) < Math.abs(pts[best][0] - px)) best = i;
    const [bx, by] = pts[best];
    cross.setAttribute('x1', bx);
    cross.setAttribute('x2', bx);
    hdot.setAttribute('cx', bx);
    hdot.setAttribute('cy', by);
    hover.setAttribute('visibility', 'visible');
    const prev = best > 0 ? points[best].kg - points[best - 1].kg : null;
    tip.innerHTML = `<strong>${fmt1(points[best].kg)} kg</strong><span>${esc(fmtDateShort(points[best].date, true))}</span>${
      prev !== null ? `<span>${prev > 0 ? '+' : prev < 0 ? '−' : '±'}${fmt1(Math.abs(prev))} kg t.o.v. vorige</span>` : ''
    }`;
    tip.hidden = false;
    const scale = rect.width / width;
    const left = Math.min(Math.max(bx * scale, 60), rect.width - 60);
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.max(by * scale - 12, 0)}px`;
  };
  const hide = () => {
    hover.setAttribute('visibility', 'hidden');
    tip.hidden = true;
  };
  svg.addEventListener('pointerdown', (e) => show(e.clientX));
  svg.addEventListener('pointermove', (e) => show(e.clientX));
  svg.addEventListener('pointerleave', hide);
  svg.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'mouse') setTimeout(hide, 1800);
  });
}
