<script setup lang="ts">
import { onMounted } from 'vue'
import Gate from './views/Gate.vue'
import { connectWallet, store } from './store.js'

onMounted(() => { void connectWallet() })
</script>

<template>
  <Gate v-if="store.wallet !== 'ready'" />
  <router-view v-else />
</template>
