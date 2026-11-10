<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import Gate from './views/Gate.vue'
import { connectWallet, store } from './store.js'

const FIELD = 'input, textarea, select, label, [contenteditable]'
const isField = (el: Element | null) => !!el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)

/**
 * Phone keyboards stay open until the field loses focus, and a tap on plain page content never moves focus.
 * So a touch outside any field closes the keyboard, and so does a tap on a button or link once it has acted.
 */
function onTouch(e: Event) {
  const active = document.activeElement
  if (!isField(active)) return
  const target = e.target as Element | null
  if (target?.closest(FIELD) || target?.closest('button, a')) return
  ;(active as HTMLElement).blur()
}
function onClick(e: Event) {
  const active = document.activeElement
  if (!isField(active)) return
  if ((e.target as Element | null)?.closest('button, a')) (active as HTMLElement).blur()
}
function onKey(e: KeyboardEvent) {
  const active = document.activeElement
  if (e.key === 'Enter' && isField(active) && active!.tagName !== 'TEXTAREA') (active as HTMLElement).blur()
}

onMounted(() => {
  void connectWallet()
  document.addEventListener('touchstart', onTouch, { passive: true })
  document.addEventListener('click', onClick)
  document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('touchstart', onTouch)
  document.removeEventListener('click', onClick)
  document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <Gate v-if="store.wallet !== 'ready'" />
  <router-view v-else />
</template>
