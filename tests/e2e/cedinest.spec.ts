/**
 * End to end, in a real browser, against the real app and API with the chains faked:
 * first open -> consent -> empty card -> new goal (sign-in) -> save $20 -> pending -> done -> share card
 * -> card shows the stamp -> take out everything -> done -> card empty again, plus the error states.
 */
import { expect, test, type Page } from '@playwright/test'

async function freshUser(page: Page) {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/')
}

async function acceptWelcome(page: Page, name = 'Yaw') {
  await expect(page).toHaveURL(/\/welcome/)
  await expect(page.getByRole('heading', { name: 'Save in dollars. See it in cedis.' })).toBeVisible()
  await page.getByTestId('name-input').fill(name)
  await page.getByTestId('consent-checkbox').check()
  await page.getByTestId('welcome-cta').click()
  await expect(page).toHaveURL(/\/$/)
}

test.describe.configure({ mode: 'serial' })

// One browser page for the whole story, so consent, the session and the mock-wallet settings carry over.
let page: Page
test.beforeAll(async ({ browser }) => { page = await browser.newPage() })
test.afterAll(async () => { await page.close() })

test('first open shows the welcome screen, then an empty card', async () => {
  await freshUser(page)
  await acceptWelcome(page)
  await expect(page.getByText('Morning, Yaw').or(page.getByText('Afternoon, Yaw')).or(page.getByText('Evening, Yaw'))).toBeVisible()
  await expect(page.getByTestId('savings-ghs')).toHaveText('GH₵ 0.00')
  await expect(page.getByText('Your card is empty for now')).toBeVisible()
  await expect(page.getByTestId('stamp-summary')).toHaveText('No stamps yet')
  await expect(page.getByText('You control your funds. CediNest never holds your money.')).toBeVisible()
  await expect(page.getByTestId('card-number')).toContainText('Card no.')
})

test('creates a goal after a one-time sign-in', async () => {
  await page.goto('/')
  await page.getByTestId('new-goal').click()
  await expect(page).toHaveURL(/\/goals\/new/)
  // Welcome already signed us in; a cleared session shows the sign-in card instead.
  const signIn = page.getByTestId('sign-in')
  if (await signIn.isVisible().catch(() => false)) await signIn.click()
  await page.getByTestId('goal-name').fill('Rent, January')
  await page.getByTestId('goal-target').fill('6000')
  await page.getByTestId('goal-month').fill('2027-01')
  await expect(page.getByTestId('goal-helper')).toContainText('About $512.82 today')
  await page.getByTestId('goal-save').click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText('Rent, January')).toBeVisible()
  await expect(page.getByText('of GH₵ 6,000')).toBeVisible()
})

test('stamps a $20 saving with two approvals and lands on the done screen', async () => {
  await page.goto('/')
  await page.getByTestId('stamp-cta').click()
  await expect(page).toHaveURL(/\/save/)
  await expect(page.getByTestId('amount-input')).toHaveValue('20.00')
  await expect(page.getByTestId('amount-helper')).toHaveText('≈ GH₵ 234.00 · $100.00 ready to save')
  await expect(page.getByTestId('goal-picked')).toHaveText('Rent, January')
  await expect(page.getByText('50 NIM').first()).toBeVisible()
  await expect(page.getByText('Nimiq Pay will ask you twice')).toBeVisible()
  await expect(page.getByText('3.7% a year, can change')).toBeVisible()
  await page.getByTestId('stamp-it').click()

  await expect(page).toHaveURL(/\/job\/j_/)
  await expect(page.getByTestId('done-title')).toHaveText('E don enter!', { timeout: 20_000 })
  await expect(page.getByText('$20 is in your Rent savings and earning from today.')).toBeVisible()
  await expect(page.getByText('20.00 USDT')).toBeVisible()
  await expect(page.getByTestId('explorer-link')).toHaveAttribute('href', /polygonscan\.com\/tx\/0x[0-9a-f]{64}/)
  await expect(page.getByTestId('share-preview')).toContainText('Yaw is saving for rent')
  await expect(page.getByTestId('share-preview')).toContainText('1 stamp this month')
  await expect(page.getByTestId('share-preview')).not.toContainText('$')
  await expect(page.getByTestId('share-preview')).not.toContainText('GH₵')

  // Share falls back to a full-screen image where navigator.share is missing.
  await page.getByTestId('share-btn').click()
  await expect(page.getByTestId('share-image')).toBeVisible()
  await page.getByRole('button', { name: 'Close' }).click()

  await page.getByTestId('back-home').click()
  await expect(page.getByTestId('savings-ghs')).toHaveText('GH₵ 235.17')
  await expect(page.getByTestId('dollars-line')).toHaveText('$20.10 in dollars · earning 3.7% a year')
  await expect(page.getByTestId('stamp-summary')).toHaveText('1 stamp · $20 saved')
  await expect(page.getByText('earned so far')).toBeVisible()
  await expect(page.getByText('Since you started')).toBeVisible()
  await expect(page.getByText('Your line starts today.')).toBeVisible()
  await expect(page.getByText('4%')).toBeVisible()
})

test('refuses a saving under $1 and above the wallet balance', async () => {
  await page.goto('/save')
  await page.getByTestId('amount-input').fill('0.50')
  await expect(page.getByTestId('error-note')).toHaveText('The smallest saving is $1.')
  await expect(page.getByTestId('stamp-it')).toBeDisabled()
  await page.getByTestId('amount-input').fill('500')
  await expect(page.getByTestId('error-note')).toContainText('You have $80.00 ready to save')
  await page.getByTestId('chip-5').click()
  await expect(page.getByTestId('amount-input')).toHaveValue('5.00')
  await expect(page.getByTestId('stamp-it')).toBeEnabled()
})

test('says so when there is not enough NIM for the stamp fee, and nothing moves', async () => {
  await page.goto('/')
  await page.evaluate(() => localStorage.setItem('mock.nimBalanceLuna', '1000000'))
  await page.goto('/save')
  await page.getByTestId('chip-10').click()
  await page.getByTestId('stamp-it').click()
  await expect(page.getByTestId('error-note')).toContainText('Not enough NIM for the stamp fee')
  await expect(page.getByTestId('error-note')).toContainText('This saving needs 50 NIM. You have 10 NIM.')
  await page.evaluate(() => localStorage.removeItem('mock.nimBalanceLuna'))
})

test('a cancelled fee moves nothing; a cancelled signature files a refund', async () => {
  await page.goto('/')
  await page.evaluate(() => localStorage.setItem('mock.cancelFee', '1'))
  await page.goto('/save')
  await page.getByTestId('stamp-it').click()
  await expect(page.getByTestId('error-note')).toHaveText('No problem. Nothing was paid and nothing moved.')
  await page.evaluate(() => { localStorage.removeItem('mock.cancelFee'); localStorage.setItem('mock.cancelSign', '1') })
  await page.reload()
  await page.getByTestId('stamp-it').click()
  await expect(page.getByTestId('error-note')).toContainText('You paid the stamp fee but did not sign, so your USDT did not move. We will send your 50 NIM back within 24 hours.')
  await page.evaluate(() => localStorage.removeItem('mock.cancelSign'))
  await page.goto('/')
  await expect(page.getByTestId('stamp-summary')).toHaveText('1 stamp · $20 saved')
})

test('a bad NIM payment fails the job without moving money', async () => {
  await page.goto('/')
  await page.evaluate(() => localStorage.setItem('mock.nimHashPrefix', 'dead'))
  await page.goto('/save')
  await page.getByTestId('chip-5').click()
  await page.getByTestId('stamp-it').click()
  await expect(page).toHaveURL(/\/job\/j_/)
  await expect(page.getByTestId('error-note')).toContainText('We could not find a valid stamp fee payment, so nothing moved.', { timeout: 20_000 })
  await page.evaluate(() => localStorage.removeItem('mock.nimHashPrefix'))
  await page.getByRole('button', { name: 'Back to my card' }).click()
  await expect(page.getByTestId('savings-ghs')).toHaveText('GH₵ 235.17')
})

test('takes out everything and the card goes back to zero', async () => {
  await page.goto('/')
  await page.getByTestId('take-out-cta').click()
  await expect(page).toHaveURL(/\/take-out/)
  await expect(page.getByTestId('everything')).toContainText('Everything ($20.10)')
  await page.getByTestId('take-it-out').click()
  await expect(page).toHaveURL(/\/job\/j_/)
  await expect(page.getByTestId('done-title')).toHaveText('Done. $20.10 is back in your wallet.', { timeout: 20_000 })
  await page.getByTestId('back-home').click()
  await expect(page.getByTestId('savings-ghs')).toHaveText('GH₵ 0.00')
  await page.goto('/take-out')
  await expect(page.getByTestId('error-note')).toHaveText('There is nothing in your savings to take out yet.')
  await expect(page.getByTestId('take-it-out')).toBeDisabled()
})

test('edits and archives a goal', async () => {
  await page.goto('/')
  await page.getByTestId(/^goal-g_/).first().click()
  await expect(page).toHaveURL(/\/goals\/g_/)
  await expect(page.getByTestId('goal-name')).toHaveValue('Rent, January')
  await page.getByTestId('goal-target').fill('6500')
  await page.getByTestId('goal-save').click()
  await expect(page.getByText('of GH₵ 6,500')).toBeVisible()
  await page.getByTestId(/^goal-g_/).first().click()
  await page.getByTestId('goal-archive').click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText('No goals yet.')).toBeVisible()
})

test('shows the gate outside Nimiq Pay', async ({ browser }) => {
  const ctx = await browser.newContext({ ...devicesSafe() })
  const page = await ctx.newPage()
  await page.addInitScript(() => { Object.defineProperty(window, '__noWallet', { value: true }) })
  // Without the mock wallet flag the SDK waits 10 s for window.nimiq; we shorten by removing it after install.
  await page.route('**/src/dev/mock-wallet.ts*', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: 'export function installMockWallet(){}' }))
  await page.goto('/')
  await expect(page.getByText('Connecting to Nimiq Pay…')).toBeVisible()
  await expect(page.getByText('Open CediNest inside Nimiq Pay')).toBeVisible({ timeout: 15_000 })
  await ctx.close()
})

function devicesSafe() { return {} }
