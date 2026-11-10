/** SCREENSHOTS=1 npx playwright test screenshots  -> assets/screenshots/*.png for the README. */
import { expect, test, type Page } from '@playwright/test'

test.skip(process.env.SCREENSHOTS !== '1', 'set SCREENSHOTS=1 to refresh the README screenshots')
test.describe.configure({ mode: 'serial' })

let page: Page
test.beforeAll(async ({ browser }) => { page = await browser.newPage() })
test.afterAll(async () => { await page.close() })

const shot = (name: string) => page.screenshot({ path: `assets/screenshots/${name}.png`, fullPage: true })

// Screens that pin their button to the bottom of the viewport: shoot them in a short viewport so the shot stays compact.
async function compactShot(name: string) {
  const viewport = page.viewportSize()!
  await page.setViewportSize({ width: viewport.width, height: 560 })
  const height = await page.evaluate(() => document.documentElement.scrollHeight)
  await page.screenshot({ path: `assets/screenshots/${name}.png`, clip: { x: 0, y: 0, width: viewport.width, height } })
  await page.setViewportSize(viewport)
}

test('captures the main screens', async () => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/')
  await shot('1-welcome')
  await page.getByTestId('name-input').fill('Yaw')
  await page.getByTestId('consent-checkbox').check()
  await page.getByTestId('welcome-cta').click()
  await expect(page.getByText('Your card is empty for now')).toBeVisible()
  await shot('2-home-empty')

  await page.getByTestId('new-goal').click()
  await page.getByTestId('goal-name').fill('Rent advance, January')
  await page.getByTestId('goal-target').fill('12000')
  await page.getByTestId('goal-month').fill('2027-12')
  await page.getByTestId('goal-month').blur()
  await compactShot('3-new-goal')
  await page.getByTestId('goal-save').click()
  await expect(page.getByText('Rent advance, January')).toBeVisible()

  await page.getByTestId('stamp-cta').click()
  await expect(page.getByTestId('goal-picked')).toHaveText('Rent advance, January')
  await shot('4-save')
  await page.getByTestId('stamp-it').click()
  await expect(page.getByTestId('done-title')).toHaveText('E enter!')
  await shot('5-done')
  await page.getByTestId('back-home').click()
  await expect(page.getByTestId('stamp-summary')).toHaveText('1 stamp · $20 saved')
  await shot('6-home')

  await page.getByTestId('take-out-cta').click()
  await compactShot('7-take-out')
})
