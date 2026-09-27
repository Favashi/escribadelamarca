// Barra de pestañas: pestaña «Revisión» solo para admin, con contador de pendientes.
import { $ } from './util.js';
import { isAdmin, isSupporter, pendingCount } from './store.js';
import { unseenResolved } from './views/contributions.js';

export function updateAdminBadge() {
  const nav = $('#nav');
  const tab = $('#nav [data-admin-tab]');
  if (!nav || !tab) return;
  const admin = isAdmin();
  tab.hidden = !admin;
  // Los usuarios tienen «Aportaciones» en el hueco de «Admin»: la barra siempre tiene 6 pestañas
  const contrib = $('#nav [data-contrib-tab]');
  if (contrib) {
    contrib.hidden = admin;
    const m = admin ? 0 : unseenResolved();
    const b = $('.tab-badge', contrib);
    b.textContent = String(m);
    b.hidden = m === 0;
    contrib.setAttribute('aria-label', m ? `Aportaciones, ${m} ${m === 1 ? 'propuesta revisada' : 'propuestas revisadas'}` : 'Aportaciones');
  }
  nav.classList.toggle('has-admin', true);
  const n = admin ? pendingCount() : 0;
  const badge = $('.tab-badge', tab);
  badge.textContent = n > 99 ? '99+' : String(n);
  badge.hidden = n === 0;
  tab.setAttribute('aria-label', n ? `Admin, ${n} pendientes de revisar` : 'Admin');

  // Estrella discreta en la pestaña Perfil para los Mecenas
  const profile = $('#nav a[href="#/perfil"]');
  if (profile) {
    profile.classList.toggle('is-supporter', isSupporter());
    profile.setAttribute('aria-label', isSupporter() ? 'Perfil (Mecenas)' : 'Perfil');
  }
}
