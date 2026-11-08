import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import './styles/base.css'

async function boot() {
  if (import.meta.env.VITE_MOCK_WALLET === '1') {
    const { installMockWallet } = await import('./dev/mock-wallet')
    installMockWallet()
  }
  createApp(App).use(router).mount('#app')
}

void boot()
