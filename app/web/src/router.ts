import { createRouter, createWebHistory } from 'vue-router';
import { setUnauthorizedHandler } from './api';
import { applySession, loadSession, session } from './session';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('./views/LoginView.vue'), meta: { public: true } },
    { path: '/', name: 'evenings', component: () => import('./views/EveningsView.vue') },
    {
      path: '/abende/:id',
      name: 'evening',
      component: () => import('./views/EveningView.vue'),
      props: (r) => ({ id: Number(r.params.id) }),
    },
    { path: '/fotos', name: 'entries', component: () => import('./views/EntriesView.vue') },
    { path: '/entries/:id', name: 'entry', component: () => import('./views/EntryView.vue'), props: (r) => ({ id: Number(r.params.id) }) },
    { path: '/stats', name: 'stats', component: () => import('./views/StatsView.vue') },
    { path: '/admin', name: 'admin', component: () => import('./views/AdminView.vue'), meta: { admin: true } },
    {
      path: '/admin/groups/:id',
      name: 'admin-group',
      component: () => import('./views/AdminGroupView.vue'),
      props: (r) => ({ id: Number(r.params.id) }),
      meta: { admin: true },
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

router.beforeEach(async (to) => {
  if (!session.loaded) {
    await loadSession();
  }
  if (to.meta.public) {
    return session.me ? { name: 'evenings' } : true;
  }
  if (!session.me) {
    return { name: 'login', query: to.fullPath !== '/' ? { next: to.fullPath } : {} };
  }
  if (to.meta.admin && !session.me.user.isAdmin) {
    return { name: 'evenings' };
  }
  return true;
});

setUnauthorizedHandler(() => {
  applySession(null);
  void router.push({ name: 'login' });
});
