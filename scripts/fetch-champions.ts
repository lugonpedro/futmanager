/**
 * Downloads, unchanged, the FotMob pages the Champions League pack is built
 * from, into a folder that is not kept in the repo:
 *
 *   npm run pack:fetch-champions -- ../dados-champions
 *
 * It saves the competition page (fotmob-42.json), the squad page of every
 * club in the league phase and of those knocked out in the last qualifying
 * round (fotmob-time-<id>.json), and, for the competition and each club's
 * league, the page and the season rankings of rating and minutes, for this
 * season and the one before (fotmob-<league>-<stat>.json and
 * fotmob-<league>-anterior-<stat>.json). A file already there is kept, so a
 * run cut short can be started again.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const CHAMPIONS = 42
/** FotMob keeps the qualifying rounds, play-offs included, in a competition of their own. */
const QUALIFICATION = 10611
const STATS = ['rating', 'mins_played']
/** The league phase starts in mid-September; the qualifying play-offs end in late August. */
const LEAGUE_PHASE_START = '2026-09-10'
const PLAYOFFS_START = '2026-08-15'

const folder = process.argv[2]
if (!folder) throw new Error('usage: npm run pack:fetch-champions -- <folder>')
mkdirSync(folder, { recursive: true })

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
  Accept: 'application/json',
}
const pause = () => new Promise((resolve) => setTimeout(resolve, 1000))
const failures: string[] = []

/** Fetches a JSON once, saves it as is, and returns it; null when it fails. */
async function save(url: string, name: string): Promise<unknown> {
  const path = join(folder, name)
  if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8'))
  await pause()
  try {
    const response = await fetch(url, { headers: HEADERS })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const text = await response.text()
    const data = JSON.parse(text)
    writeFileSync(path, text)
    console.log(`ok   ${name}`)
    return data
  } catch (error) {
    failures.push(`${name}: ${url} (${(error as Error).message})`)
    console.log(`erro ${name}: ${(error as Error).message}`)
    return null
  }
}

type StatLink = { RelativePath: string; Name: string }
type League = {
  details?: { name?: string }
  stats?: { seasonStatLinks?: StatLink[] }
  table?: {
    data?: { table?: { all?: { id: number }[] }; tables?: { table?: { all?: { id: number }[] } }[] }
  }[]
  fixtures?: {
    allMatches?: { home: { id: string }; away: { id: string }; status?: { utcTime?: string } }[]
  }
}
type Team = { details?: { name?: string; primaryLeagueId?: number } }

const leaguePage = (id: number) =>
  save(
    `https://www.fotmob.com/api/data/leagues?id=${id}`,
    `fotmob-${id}.json`,
  ) as Promise<League | null>

/** This season's and last season's rankings for a league, from its own links. */
async function saveRankings(id: number, league: League) {
  const links = league.stats?.seasonStatLinks ?? []
  for (const [index, prefix] of [
    [0, `fotmob-${id}`],
    [1, `fotmob-${id}-anterior`],
  ] as const) {
    const link = links[index]
    if (!link) continue
    const dir = link.RelativePath.replace(/[^/]+$/, '')
    for (const stat of STATS) {
      await save(`https://data.fotmob.com/${dir}${stat}.json`, `${prefix}-${stat}.json`)
    }
  }
}

const champions = await leaguePage(CHAMPIONS)
if (!champions) throw new Error('não deu para baixar a página da Champions League')
await saveRankings(CHAMPIONS, champions)

// League phase: the one table of 36 (FotMob may nest it in `tables`).
const tableIds = new Set<number>()
for (const block of champions.table ?? []) {
  const tables = [block.data?.table, ...(block.data?.tables ?? []).map((t) => t.table)]
  for (const table of tables) for (const row of table?.all ?? []) tableIds.add(Number(row.id))
}
// Knocked out in the qualifying play-offs: played in late August, not in the table.
const qualification = await leaguePage(QUALIFICATION)
const knockedOut = new Set<number>()
for (const match of qualification?.fixtures?.allMatches ?? []) {
  const time = match.status?.utcTime ?? ''
  if (time < PLAYOFFS_START || time >= LEAGUE_PHASE_START) continue
  for (const id of [match.home.id, match.away.id].map(Number)) {
    if (!tableIds.has(id)) knockedOut.add(id)
  }
}
console.log(`fase de liga: ${tableIds.size} clubes; eliminados nos play-offs: ${knockedOut.size}`)

const leagues = new Set<number>()
for (const id of [...tableIds, ...knockedOut]) {
  const team = (await save(
    `https://www.fotmob.com/api/data/teams?id=${id}`,
    `fotmob-time-${id}.json`,
  )) as Team | null
  const league = team?.details?.primaryLeagueId
  if (league && league !== CHAMPIONS) leagues.add(league)
}
for (const id of leagues) {
  const league = await leaguePage(id)
  if (league) await saveRankings(id, league)
}

console.log(`\n${leagues.size} ligas nacionais`)
if (failures.length) {
  console.log(`\nfalharam (${failures.length}):`)
  failures.forEach((f) => console.log(`  ${f}`))
}
