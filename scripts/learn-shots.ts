/*
 * Takes the screenshots of the Aprenda page: builds nothing itself, so run
 * `npm run build` first (`npm run learn:shots` does both). Starts a career
 * with the Brasileirão pack on a fixed seed, plays into the season, and saves
 * a phone and a desktop crop of each screen to public/aprenda/ as WebP.
 *
 * Needs Playwright's Chromium: `npx playwright install chromium` once.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium, type Browser, type Locator, type Page } from 'playwright'
import { preview } from 'vite'
import { LEARN_SHOTS, type AutoShot } from '../src/ui/learnShots.ts'

const OUT = 'public/aprenda'
const SEED = 20270101
/** The career starts with this club, a mid-table side of the Série A. */
const CLUB = 7
/** The shots are taken at the end of this month, a few months into the season. */
const PLAY_UNTIL_MONTH = 6

const DEVICES = {
  celular: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 },
  computador: { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 },
} as const
type Device = keyof typeof DEVICES

/** The tallest a shot gets, in CSS pixels. */
const MAX_HEIGHT: Record<Device, number> = { celular: 760, computador: 640 }

/** What each shot frames, once the career is under way. */
const FRAMES: Record<AutoShot, (page: Page) => Promise<Locator | number>> = {
  calendario: async (page) => {
    await open(page, '/jogo/calendario')
    await page
      .getByRole('button', { name: /Simular até/ })
      .nth(2)
      .click()
    return 720
  },
  tabela: async (page) => {
    await open(page, '/jogo/competicoes')
    return 640
  },
  diretoria: async (page) => {
    await open(page, '/jogo/clube')
    return page.locator('section#diretoria')
  },
  tatica: async (page) => {
    await open(page, '/jogo/elenco')
    return page.locator('[data-slot=card]').first()
  },
  energia: async (page) => {
    await open(page, '/jogo/elenco')
    return page.locator('table').first()
  },
  jogadores: async (page) => {
    await open(page, '/jogo/elenco')
    await page.locator('table tbody button.font-medium').nth(3).click()
    await page.waitForTimeout(400)
    return page.locator('[data-slot=sheet-content]')
  },
  treino: async (page) => {
    await open(page, '/jogo/elenco')
    return page
      .locator('[data-slot=card]')
      .filter({ has: page.locator('[data-slot=card-title]', { hasText: /^Treino$/ }) })
  },
  mercado: async (page) => {
    await open(page, '/jogo/mercado')
    // With the window closed only free agents show; the full list reads better.
    await page.getByRole('button', { name: 'Ver todos para observar' }).click()
    await page.waitForTimeout(300)
    return 700
  },
  financas: async (page) => {
    await open(page, '/jogo/clube/financas')
    return 760
  },
}

/** Moves inside the app, as a link would: a reload would bring back the last save. */
async function open(page: Page, path: string) {
  await page.evaluate((to) => {
    history.pushState(null, '', to)
    dispatchEvent(new PopStateEvent('popstate'))
  }, path)
  await page.waitForTimeout(600)
  await page.evaluate(() => window.scrollTo(0, 0))
}

/** Closes the notices, which would cover the shots. */
async function clearToasts(page: Page) {
  const toasts = page.locator('[data-sonner-toast]')
  for (let i = 0; i < 20 && (await toasts.count()) > 0; i++) {
    await toasts.first().locator('[data-close-button]').dispatchEvent('click')
    await page.waitForTimeout(150)
  }
  await page.waitForTimeout(400)
}

/** The same random numbers every run, so the world and the season come out the same. */
function seededRandom(seed: number) {
  let state = seed >>> 0
  Math.random = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

let targetDay: string | undefined

async function startCareer(browser: Browser, base: string, device: Device) {
  const page = await browser.newPage(DEVICES[device])
  await page.addInitScript(seededRandom, SEED)
  page.on('pageerror', (error) => console.error(device, error.message))
  await page.goto(new URL('/novo', base).href)
  await page.getByRole('radio', { name: 'Usar pacote' }).click()
  const clubs = page.locator('ul:not([aria-label]) li button').filter({ hasText: 'rep.' })
  await clubs.nth(CLUB).click()
  await page.waitForURL('**/jogo')
  // The first save lands a moment after the career opens.
  await page.waitForTimeout(1500)
  // A bid for one of the user's players stops the simulation, and in the January
  // window they come almost daily; it just goes on again.
  for (let run = 0; run < 120; run++) {
    // Leaving and coming back opens the calendar on the current month again.
    await open(page, '/jogo')
    await open(page, '/jogo/calendario')
    // The computer shows a month at a time; the phone, a list of the days with games.
    if (device === 'computador') {
      for (let i = 1; i < PLAY_UNTIL_MONTH; i++) {
        await page.getByRole('button', { name: 'Próximo mês' }).click()
      }
    }
    const month = String(PLAY_UNTIL_MONTH).padStart(2, '0')
    // The phone goes first and picks the last day with games in the month; the
    // computer plays to that same day.
    const target = targetDay
      ? page.getByRole('button', { name: targetDay, exact: true })
      : page.getByRole('button', { name: new RegExp(`^Simular até .*/${month}/`) }).last()
    if ((await target.count()) === 0) break
    targetDay ??= (await target.getAttribute('aria-label')) ?? undefined
    await target.click()
    const simulate = page.getByRole('button', { name: 'Simular', exact: true })
    await simulate.click()
    // The card goes away once the simulation is over.
    await page
      .getByRole('button', { name: 'Cancelar' })
      .waitFor({ state: 'detached', timeout: 120_000 })
    const stopped = await page
      .getByText('A simulação parou')
      .first()
      .waitFor({ timeout: 2000 })
      .then(
        () => true,
        () => false,
      )
    if (!stopped) break
    await clearToasts(page)
  }
  await clearToasts(page)
  return page
}

/** A PNG from the browser, turned into a WebP by the browser too. */
async function toWebp(page: Page, png: Buffer): Promise<Buffer> {
  const data = await page.evaluate(
    async (src) => {
      const image = new Image()
      image.src = src
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      canvas.getContext('2d')!.drawImage(image, 0, 0)
      return canvas.toDataURL('image/webp', 0.82)
    },
    `data:image/png;base64,${png.toString('base64')}`,
  )
  return Buffer.from(data.split(',')[1], 'base64')
}

async function shoot(page: Page, device: Device, shot: AutoShot) {
  const frame = await FRAMES[shot](page)
  await clearToasts(page)
  const { width } = DEVICES[device].viewport
  // Shots are taken from the top of the page, where the phone's header sits.
  await page.evaluate(() => window.scrollTo(0, 0))
  // On the computer the menu on the left is left out.
  const left =
    device === 'computador'
      ? await page
          .locator('main')
          .first()
          .evaluate((m) => m.getBoundingClientRect().x)
      : 0
  // A long part, like the squad list, is cut to its top.
  const box =
    typeof frame === 'number'
      ? { x: left, y: 0, width: width - left, height: frame }
      : await frame.evaluate((element) => {
          const { x, y, width, height } = element.getBoundingClientRect()
          return { x: x + scrollX, y: y + scrollY, width, height }
        })
  const clip = { ...box, height: Math.min(box.height, MAX_HEIGHT[device]) }
  const png = await page.screenshot({ clip, fullPage: true })
  await writeFile(`${OUT}/${shot}-${device}.webp`, await toWebp(page, png))
  console.log(`${shot}-${device}.webp`)
}

const server = await preview({ preview: { port: 4317, strictPort: false }, logLevel: 'warn' })
const base = server.resolvedUrls!.local[0]
const browser = await chromium.launch()
try {
  await mkdir(OUT, { recursive: true })
  for (const device of Object.keys(DEVICES) as Device[]) {
    const page = await startCareer(browser, base, device)
    for (const shot of LEARN_SHOTS) await shoot(page, device, shot)
    await page.close()
  }
} finally {
  await browser.close()
  await server.close()
}
