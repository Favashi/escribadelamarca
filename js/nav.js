// Barra de pestañas: pestaña «Revisión» solo para admin, con contador de pendientes.
import { $ } from './util.js';
import { isAdmin, pendingCount } from './store.js';

export function updateAdminBadge() {
  const nav = $('#nav');
  const tab = $('#nav [data-admin-tab]');
  if (!nav || !tab) return;
  const admin = isAdmin();
  tab.hidden = !admin;
  nav.classList.toggle('has-admin', admin);
  const n = admin ? pendingCount() : 0;
  const badge = $('.tab-badge', tab);
  badge.textContent = n > 99 ? '99+' : String(n);
  badge.hidden = n === 0;
  tab.setAttribute('aria-label', n ? `Admin, ${n} pendientes de revisar` : 'Admin');
}
