// Admin → Estadísticas: uso de la app por periodo (7/30/90/365 días) comparado con el periodo anterior.
// Los datos salen de las vistas agregadas del esquema «analytics» (admin_stats): las mismas que usa Looker Studio.
import { html, raw, $, fmtShort, download } from '../util.js';
import { supabase } from '../supabase.js';

const PERIODS = [[7, '7 días'], [30, '30 días'], [90, '90 días'], [365, '1 año']];
const KEY = 'edm.statsDays';
const C = { purple: 'var(--purple)', accent: 'var(--accent)', gold: 'var(--gold)', ok: 'var(--ok)', muted: 'var(--muted)', admin: 'var(--admin)' };

const num = (n) => Number(n || 0).toLocaleString('es-ES');
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

/** «+12 %» / «−5 %» / «=» / «nuevo» frente al periodo anterior. */
function delta(cur, prev, lowerIsBetter = false) {
  cur = Number(cur || 0); prev = Number(prev || 0);
  const good = (up) => ((up !== lowerIsBetter) ? 'up' : 'down');   // clase de color: verde si mejora
  if (!prev) return cur ? html`<em class="delta ${good(true)}">nuevo</em>` : html`<em class="delta">—</em>`;
  const d = Math.round(((cur - prev) / prev) * 100);
  if (!d) return html`<em class="delta">= que antes</em>`;
  return html`<em class="delta ${good(d > 0)}">${d > 0 ? '+' : '−'}${Math.abs(d)} % vs. periodo anterior</em>`;
}

const kpi = (value, label, extra) => html`<div class="kpi"><span>${num(value)}</span><small>${label}</small>${raw(extra)}</div>`;

/**
 * Gráfica de líneas en SVG con varias series. data: [{ dia, ...valores }], series: [{ key, label, color }].
 * Escala común; etiquetas de fecha al principio, en medio y al final.
 */
function lineChart(title, data, series) {
  const W = 640, H = 180, P = { l: 32, r: 8, t: 10, b: 22 };
  const max = Math.max(1, ...data.flatMap((d) => series.map((s) => Number(d[s.key] || 0))));
  const x = (i) => P.l + (data.length < 2 ? 0 : (i * (W - P.l - P.r)) / (data.length - 1));
  const y = (v) => H - P.b - (Number(v || 0) / max) * (H - P.t - P.b);
  const ticks = [0, Math.round(max / 2), max];
  const labels = [0, Math.floor((data.length - 1) / 2), data.length - 1].filter((v, i, a) => a.indexOf(v) === i);
  const total = (k) => data.reduce((t, d) => t + Number(d[k] || 0), 0);
  const aria = `${title}: ${series.map((s) => `${s.label} ${total(s.key)} en total`).join(', ')}`;
  return html`<figure class="lchart">
    <figcaption>${title}</figcaption>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${aria}" preserveAspectRatio="none">
      ${ticks.map((t) => raw(html`<line x1="${P.l}" x2="${W - P.r}" y1="${y(t)}" y2="${y(t)}" class="grid"/>
        <text x="${P.l - 6}" y="${y(t) + 4}" text-anchor="end">${t}</text>`))}
      ${labels.map((i) => raw(html`<text x="${x(i)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}">${fmtShort(data[i]?.dia).slice(0, 5)}</text>`))}
      ${series.map((s) => raw(html`<polyline fill="none" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"
        style="stroke:${s.color}" points="${data.map((d, i) => `${x(i).toFixed(1)},${y(d[s.key]).toFixed(1)}`).join(' ')}"/>`))}
    </svg>
    <p class="legend">${series.map((s) => raw(html`<span><i style="background:${s.color}"></i>${s.label} <b>${num(total(s.key))}</b></span>`))}</p>
  </figure>`;
}

/** Barras horizontales (top de libros). */
function barList(title, rows, empty) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return html`<section class="panel"><h2>${title}</h2>${rows.length ? raw(html`<ol class="barlist">${rows.map((r) => raw(html`<li>
      <span class="bl-label">${r.codigo ? raw(html`<span class="code">${r.codigo}</span> `) : ''}${r.titulo}</span>
      <span class="bl-bar"><span style="width:${pct(r.n, max)}%"></span></span><strong>${r.n}</strong></li>`))}</ol>`)
    : raw(html`<p class="muted small">${empty}</p>`)}</section>`;
}

export async function renderStats(body, days) {
  if (!days) { try { days = Number(localStorage.getItem(KEY)) || 30; } catch { days = 30; } }
  body.innerHTML = '<div class="loading" aria-busy="true">Calculando…</div>';
  const { data: s, error } = await supabase.rpc('admin_stats', { p_days: days });
  if (error) throw error;
  const cur = s.current || {}, prev = s.previous || {};
  const scanOk = pct(cur.escaneos_reconocidos, cur.escaneos);
  const channelName = (c) => ({ directo: 'Directo / sin canal', otro: 'Otros', 'lista-compartida': 'Listas compartidas' }[c] || c);

  body.innerHTML = html`
    <div class="stats-head">
      <div class="seg period-seg" role="radiogroup" aria-label="Periodo">
        ${PERIODS.map(([d, label]) => raw(html`<label><input type="radio" name="period" value="${d}" ${d === s.days ? 'checked' : ''}><span>${label}</span></label>`))}
      </div>
      <button type="button" class="btn btn-ghost btn-sm" data-csv>Descargar CSV</button>
    </div>
    <p class="muted small">Últimos ${s.days} días comparados con los ${s.days} anteriores.</p>

    <section class="kpis">
      ${raw(kpi(cur.altas, 'altas', delta(cur.altas, prev.altas)))}
      ${raw(kpi(s.active_current, 'usuarios activos', delta(s.active_current, s.active_previous)))}
      ${raw(kpi(cur.escaneos, `escaneos · ${scanOk} % reconocidos`, delta(cur.escaneos, prev.escaneos)))}
      ${raw(kpi(cur.libros_anadidos, 'libros añadidos', delta(cur.libros_anadidos, prev.libros_anadidos)))}
      ${raw(kpi(cur.deseos_anadidos, 'deseos añadidos', delta(cur.deseos_anadidos, prev.deseos_anadidos)))}
      ${raw(kpi(cur.errores_app, 'errores en la app', delta(cur.errores_app, prev.errores_app, true)))}
    </section>

    <section class="panel">
      ${raw(lineChart('Actividad diaria', s.daily, [
        { key: 'activos', label: 'Usuarios activos', color: C.purple },
        { key: 'altas', label: 'Altas', color: C.accent }]))}
      ${raw(lineChart('Escaneos', s.daily, [
        { key: 'escaneos_reconocidos', label: 'Reconocidos', color: C.ok },
        { key: 'escaneos_varios', label: 'Varios libros', color: C.gold },
        { key: 'escaneos_desconocidos', label: 'Desconocidos', color: C.accent }]))}
      ${raw(lineChart('Colección', s.daily, [
        { key: 'libros_anadidos', label: 'Libros añadidos', color: C.purple },
        { key: 'deseos_anadidos', label: 'Deseos añadidos', color: C.gold },
        { key: 'busquedas', label: 'Búsquedas de aventuras', color: C.admin }]))}
    </section>

    <div class="admin-cols">
      <section class="panel">
        <h2>Difusión por canal</h2>
        ${s.channels.length ? raw(html`<div class="table-scroll"><table class="acq-table">
          <thead><tr><th>Canal</th><th>Visitas</th><th>Altas</th><th>Conversión</th></tr></thead>
          <tbody>${s.channels.map((c) => raw(html`<tr><td>${channelName(c.canal)}</td><td>${num(c.visitas)}</td><td>${num(c.altas)}</td>
            <td>${c.visitas ? `${pct(c.altas, c.visitas)} %` : '—'}</td></tr>`))}</tbody></table></div>`)
          : raw('<p class="muted small">Sin visitas ni altas en el periodo.</p>')}
      </section>
      <section class="panel">
        <h2>¿Vuelven?</h2>
        <p class="muted small">De quienes se registraron cada semana, qué parte volvió a abrir la app 1, 2 y 4 semanas después.</p>
        ${s.retention.length ? raw(html`<div class="table-scroll"><table class="acq-table">
          <thead><tr><th>Semana de alta</th><th>Altas</th><th>+1 sem.</th><th>+2 sem.</th><th>+4 sem.</th></tr></thead>
          <tbody>${s.retention.map((r) => raw(html`<tr><td>${fmtShort(r.semana_alta)}</td><td>${r.usuarios}</td>
            <td>${pct(r.vuelven_semana_1, r.usuarios)} %</td><td>${pct(r.vuelven_semana_2, r.usuarios)} %</td><td>${pct(r.vuelven_semana_4, r.usuarios)} %</td></tr>`))}</tbody>
          </table></div>`) : raw('<p class="muted small">Aún no hay altas en este periodo.</p>')}
      </section>
    </div>

    <div class="admin-cols three">
      ${raw(barList('Más coleccionados', s.top.coleccionado, 'Aún no hay libros en bibliotecas.'))}
      ${raw(barList('Más deseados', s.top.deseado, 'Aún no hay listas de deseos.'))}
      ${raw(barList('Más jugados y dirigidos', s.top.jugado, 'Aún nadie ha marcado partidas.'))}
    </div>

    <section class="panel">
      ${raw(lineChart('Salud', s.health, [
        { key: 'errores_app', label: 'Errores en la app', color: C.accent },
        { key: 'avisos_fallidos', label: 'Avisos de Telegram fallidos', color: C.gold }]))}
      <p class="muted small">Hoy: ${num(s.summary.usuarios)} usuarios (${num(s.summary.mecenas)} Mecenas) ·
        ${num(s.summary.libros_en_bibliotecas)} libros en bibliotecas · base de datos ${s.summary.bd_mb} MB de 500.</p>
    </section>`;

  body.querySelectorAll('input[name=period]').forEach((r) => r.addEventListener('change', () => {
    try { localStorage.setItem(KEY, r.value); } catch { /* sin storage */ }
    renderStats(body, Number(r.value));
  }));
  $('[data-csv]', body).onclick = () => {
    const cols = Object.keys(s.daily[0] || { dia: '' });
    const csv = [cols.join(';'), ...s.daily.map((d) => cols.map((c) => d[c]).join(';'))].join('\n');
    download(`escriba-estadisticas-${s.days}d.csv`, '﻿' + csv, 'text/csv;charset=utf-8');
  };
}
