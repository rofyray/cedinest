import { createRouter, createWebHistory } from 'vue-router'
import { consent, store } from './store.js'

export const router = createRouter({
  history: createWebHistory(),
  // Every screen starts at the top; going back returns to where the user was.
  scrollBehavior: (_to, _from, saved) => saved ?? { top: 0 },
  routes: [
    { path: '/', name: 'home', component: () => import('./views/Home.vue') },
    { path: '/welcome', name: 'welcome', component: () => import('./views/Welcome.vue') },
    { path: '/save', name: 'save', component: () => import('./views/Save.vue') },
    { path: '/take-out', name: 'take-out', component: () => import('./views/TakeOut.vue') },
    { path: '/job/:id', name: 'job', component: () => import('./views/Job.vue'), props: true },
    { path: '/goals/new', name: 'goal-new', component: () => import('./views/GoalForm.vue') },
    { path: '/goals/:id', name: 'goal-edit', component: () => import('./views/GoalForm.vue'), props: true },
    ...(import.meta.env.VITE_ENABLE_LAB === '1' ? [{ path: '/lab', name: 'lab', component: () => import('./views/Lab.vue') }] : []),
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

// First open: the welcome and consent screen, before anything that moves money.
router.beforeEach((to) => {
  if (to.name === 'welcome' || to.name === 'lab') return true
  if (!consent.given() && store.wallet !== 'no_provider') return { name: 'welcome', query: to.fullPath !== '/' ? { next: to.fullPath } : {} }
  return true
})
