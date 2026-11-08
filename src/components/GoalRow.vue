<script setup lang="ts">
import { t } from '../copy/en'
import { ghs } from '../lib/format'
import type { GoalProgress } from '../lib/api'

defineProps<{ goal: GoalProgress; added?: number; link?: boolean }>()
</script>

<template>
  <component :is="link ? 'router-link' : 'div'" :to="link ? `/goals/${goal.id}` : undefined" class="goal" :data-testid="`goal-${goal.id}`">
    <div class="main">
      <div class="name">{{ goal.name }}</div>
      <div class="progress">
        <span :style="{ width: `${Math.max(0, goal.percent - (added ?? 0))}%` }"></span>
        <span v-if="added" class="new" :style="{ width: `${added}%` }"></span>
      </div>
    </div>
    <div class="right small muted">
      <span class="pct">{{ goal.percent }}%</span><br />{{ t('home.goalOf', { target: ghs(goal.targetGhs).replace('.00', '') }) }}
    </div>
  </component>
</template>

<style scoped>
.goal { display: flex; align-items: center; gap: 12px; background: var(--card); border: 1px solid var(--rule); border-radius: 12px; padding: 10px 14px; color: inherit; text-decoration: none; }
.main { flex: 1; min-width: 0; }
.name { font-weight: 700; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.progress { margin-top: 6px; }
.right { text-align: right; flex: none; }
.pct { font-family: var(--font-display); font-size: 16px; color: var(--ink); font-weight: 700; }
</style>
