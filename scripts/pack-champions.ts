/**
 * Builds the Champions League pack from FotMob alone, from the raw downloads
 * of scripts/fetch-champions.ts (a folder not kept in the repo):
 *
 *   npm run pack:champions -- ../dados-champions [--write]
 *
 * The clubs are the 36 of the league phase and, to fill the game's two
 * divisions of 20, the strongest of those knocked out in the qualifying
 * play-offs; the 20 strongest make the first division. Each squad is the
 * club's FotMob squad page, up to 32 players, most minutes first.
 *
 * A player's rating starts from his FotMob market value, with age and
 * position taken into account, on a scale like EA FC's. Then it is balanced
 * like the Brasileirão pack (scripts/pack-performance.ts): in each league,
 * season and position, his FotMob average becomes a z-score laid over the
 * spread of those players' ratings, and the rating moves toward that target
 * by minutes played, this season counting double the last one. The
 * Champions League itself is one more league, the only one where every club
 * meets on the same scale.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const PACK = 'src/packs/champions-2026.json'
const COMPETITION = '42'
const CLUB_COUNT = 40
const FIRST_DIVISION = 20

/** Rating for a €1M player in his prime, and the points each tenfold of value adds. */
const VALUE_BASE = 67
const VALUE_SLOPE = 10.5
/** Market values fall fast after 28 and run ahead of skill before 23. */
const VETERAN_AGE = 28
const VETERAN_BONUS = 1
const VETERAN_CAP = 36
const YOUNG_AGE = 23
const YOUNG_DISCOUNT = 0.8
/** Keepers are worth less than outfield players of the same level. */
const KEEPER_BONUS = 2
/** How far the performance target can pull a rating, at full minutes. */
const FOTMOB_WEIGHT = 0.6
const FOTMOB_FULL_MINUTES = 1800
const LAST_SEASON_WEIGHT = 0.5
const MIN_GROUP = 5
const MAX_STEP = 7
const MIN_RATING = 50
const MAX_RATING = 90

type Position = 'G' | 'Z' | 'L' | 'M' | 'A'
type PackPlayer = { nome: string; posicao: Position; idade?: number; nota: number }
type PackClub = {
  nome: string
  sigla: string
  cidade?: string
  cores: [string, string]
  jogadores: PackPlayer[]
}

type FotmobMember = {
  id: number
  name: string
  age?: number
  positionIdsDesc?: string | null
  transferValue?: number | null
}
type FotmobTeam = {
  details: {
    id: number
    name: string
    shortName?: string
    teamColor?: string
    primaryLeagueId?: number
    sportsTeamJSONLD?: { location?: { address?: { addressLocality?: string } } }
  }
  squad: { squad: { title: string; members: FotmobMember[] }[] }
}
type FotmobLeague = {
  table?: {
    data?: {
      table?: { all?: { id: number }[] }
      tables?: { table?: { all?: { id: number }[] } }[]
    }
  }[]
}
type FotmobRank = {
  TopLists: { StatList: { ParticiantId: number; StatValue: number; MinutesPlayed?: number }[] }[]
}

const args = process.argv.slice(2)
const folder = args.find((a) => !a.startsWith('--'))
if (!folder) throw new Error('usage: npm run pack:champions -- <raw-data-folder> [--write]')
const write = args.includes('--write')
const readJson = <T>(name: string) => JSON.parse(readFileSync(join(folder, name), 'utf8')) as T
const files = readdirSync(folder)

const average = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
const spread = (xs: number[]) => {
  const m = average(xs)
  return Math.sqrt(average(xs.map((x) => (x - m) ** 2)))
}
const clamp = (x: number) => Math.max(MIN_RATING, Math.min(MAX_RATING, Math.round(x)))

/**
 * Club names as Brazilians say them, and the short names and colours FotMob
 * doesn't give. Keyed by FotMob team id.
 */
const CLUBS: Record<number, Partial<Omit<PackClub, 'jogadores'>>> = {}

// --- Sources ---------------------------------------------------------------

/**
 * Every ranking downloaded, one per league and season ("47" this season,
 * "47-anterior" the last one): rating with minutes, and minutes alone.
 */
type Seasonal = { source: string; recency: number }
const ratings = new Map<number, (Seasonal & { value: number; minutes: number })[]>()
const minutes = new Map<number, Map<string, number>>()
for (const file of files) {
  const match = /^fotmob-(\d+(?:-anterior)?)-(rating|mins_played)\.json$/.exec(file)
  if (!match) continue
  const [, source, stat] = match
  const recency = source.endsWith('-anterior') ? LAST_SEASON_WEIGHT : 1
  for (const row of readJson<FotmobRank>(file).TopLists[0]?.StatList ?? []) {
    const id = row.ParticiantId
    const played = stat === 'rating' ? (row.MinutesPlayed ?? 0) : row.StatValue
    const own = minutes.get(id) ?? new Map<string, number>()
    own.set(source, Math.max(own.get(source) ?? 0, played))
    minutes.set(id, own)
    if (stat === 'rating') {
      ratings.set(id, [
        ...(ratings.get(id) ?? []),
        { source, recency, value: row.StatValue, minutes: played },
      ])
    }
  }
}
/** Minutes this season and last, every league together. */
const minutesOf = (id: number) => {
  let now = 0
  let before = 0
  for (const [source, played] of minutes.get(id) ?? []) {
    if (source.endsWith('-anterior')) before += played
    else now += played
  }
  return { now, before, weighted: now + LAST_SEASON_WEIGHT * before }
}

const teams = new Map(
  files
    .filter((f) => /^fotmob-time-\d+\.json$/.test(f))
    .map((f) => readJson<FotmobTeam>(f))
    .map((t) => [t.details.id, t] as const),
)
const competition = readJson<FotmobLeague>(`fotmob-${COMPETITION}.json`)
const leaguePhase = new Set<number>()
for (const block of competition.table ?? []) {
  const tables = [block.data?.table, ...(block.data?.tables ?? []).map((t) => t.table)]
  for (const table of tables) for (const row of table?.all ?? []) leaguePhase.add(Number(row.id))
}
const missing = [...leaguePhase].filter((id) => !teams.has(id))
if (missing.length) console.log(`sem página de elenco: ${missing.join(', ')}`)

// --- Squads ----------------------------------------------------------------

/** The pack position for FotMob's main position, or its squad group. */
const FOTMOB_POSITION: Record<string, Position> = {
  GK: 'G',
  CB: 'Z',
  LB: 'L',
  RB: 'L',
  LWB: 'L',
  RWB: 'L',
  CDM: 'M',
  CM: 'M',
  CAM: 'M',
  LM: 'M',
  RM: 'M',
  LW: 'A',
  RW: 'A',
  ST: 'A',
}
const GROUP_POSITION: Record<string, Position> = {
  keepers: 'G',
  defenders: 'Z',
  midfielders: 'M',
  attackers: 'A',
}
/** Where a player goes when his own position is full. */
const FALLBACK: Record<Position, Position[]> = {
  G: [],
  Z: ['L'],
  L: ['Z', 'M'],
  M: ['A', 'L'],
  A: ['M'],
}
const POSITION_ORDER: Position[] = ['G', 'Z', 'L', 'M', 'A']
/** The game's market caps a squad at 32; a generated one has 25. */
const SQUAD_MAX = 32
const SQUAD_MIN = 25
const POSITION_MAX: Record<Position, number> = { G: 4, Z: 7, L: 6, M: 10, A: 9 }
const MIN_KEEPERS = 2

type Member = FotmobMember & { group: string; position: Position }
type Row = { member: Member; player: PackPlayer; base: number; target?: number; weight: number }

const membersOf = (team: FotmobTeam): Member[] => {
  const seen = new Set<number>()
  return team.squad.squad
    .filter((g) => g.title !== 'coach')
    .flatMap((g) => g.members.map((m) => ({ ...m, group: g.title })))
    .filter((m) => !seen.has(m.id) && seen.add(m.id))
    .map((m) => ({
      ...m,
      position:
        FOTMOB_POSITION[m.positionIdsDesc?.split(',')[0] ?? ''] ?? GROUP_POSITION[m.group] ?? 'M',
    }))
}

/**
 * Who plays: everyone with minutes in either season or worth at least the
 * squad's median, most minutes first, then the rest by value up to 25. A
 * full position sends a player to a neighbouring one with room.
 */
function pickSquad(team: FotmobTeam): { member: Member; position: Position }[] {
  const members = membersOf(team)
  const values = members.map((m) => m.transferValue ?? 0).sort((a, b) => a - b)
  const median = values[Math.floor(values.length / 2)] ?? 0
  const byMinutes = (a: Member, b: Member) =>
    minutesOf(b.id).weighted - minutesOf(a.id).weighted ||
    (b.transferValue ?? 0) - (a.transferValue ?? 0)
  const playing = members
    .filter((m) => minutesOf(m.id).weighted > 0 || (m.transferValue ?? 0) >= median)
    .sort(byMinutes)
  const rest = members
    .filter((m) => !playing.includes(m))
    .sort((a, b) => (b.transferValue ?? 0) - (a.transferValue ?? 0))
  const picked: { member: Member; position: Position }[] = []
  const count = (p: Position) => picked.filter((x) => x.position === p).length
  const take = (member: Member) => {
    const position = [member.position, ...FALLBACK[member.position]].find(
      (p) => count(p) < POSITION_MAX[p],
    )
    if (position) picked.push({ member, position })
  }
  // Keepers first, so two always make it.
  const keepers = [...playing, ...rest].filter((m) => m.position === 'G')
  keepers.slice(0, MIN_KEEPERS).forEach(take)
  for (const member of playing) {
    if (picked.length >= SQUAD_MAX) break
    if (!picked.some((x) => x.member === member)) take(member)
  }
  for (const member of rest) {
    if (picked.length >= SQUAD_MIN) break
    if (!picked.some((x) => x.member === member)) take(member)
  }
  return picked
}

// --- Ratings ---------------------------------------------------------------

/** The rating a market value stands for, at the player's age and position. */
function fromValue(value: number, age: number | undefined, position: Position) {
  const prime =
    age === undefined
      ? 0
      : VETERAN_BONUS * Math.max(0, Math.min(age, VETERAN_CAP) - VETERAN_AGE) -
        YOUNG_DISCOUNT * Math.max(0, YOUNG_AGE - age)
  return (
    VALUE_BASE +
    VALUE_SLOPE * Math.log10(value / 1e6) +
    prime +
    (position === 'G' ? KEEPER_BONUS : 0)
  )
}

type Club = { team: FotmobTeam; rows: Row[]; strength: number }
const allClubs: Club[] = [...teams.values()].map((team) => {
  const rows: Row[] = pickSquad(team).map(({ member, position }) => {
    const base = member.transferValue
      ? fromValue(member.transferValue, member.age, position)
      : Number.NaN
    return {
      member,
      base,
      weight: 0,
      player: {
        nome: member.name,
        posicao: position,
        ...(member.age !== undefined ? { idade: member.age } : {}),
        nota: 0,
      },
    }
  })
  // No market value: a little under the squad's level at his position.
  const valued = rows.filter((r) => !Number.isNaN(r.base))
  for (const row of rows.filter((r) => Number.isNaN(r.base))) {
    const peers = valued.filter((r) => r.player.posicao === row.player.posicao)
    row.base = average((peers.length ? peers : valued).map((r) => r.base)) - 3
    if (Number.isNaN(row.base)) row.base = MIN_RATING
  }
  for (const row of rows) row.player.nota = clamp(row.base)
  return { team, rows, strength: 0 }
})
const rows = allClubs.flatMap((c) => c.rows)

/**
 * The performance target, as in the Brasileirão: in each league, season and
 * position, a FotMob average becomes a z-score among the pack's players
 * there, laid over the spread of their ratings. A group too small to measure
 * joins the other small ones of its season and position.
 */
const groupKey = (source: string, position: Position) => `${source}:${position}`
const sizes = new Map<string, number>()
for (const row of rows) {
  for (const r of ratings.get(row.member.id) ?? []) {
    const key = groupKey(r.source, row.player.posicao)
    sizes.set(key, (sizes.get(key) ?? 0) + 1)
  }
}
const groupOf = (source: string, position: Position) => {
  const key = groupKey(source, position)
  if ((sizes.get(key) ?? 0) >= MIN_GROUP) return key
  return groupKey(source.endsWith('-anterior') ? 'outras-anterior' : 'outras', position)
}
const groups = new Map<string, { row: Row; value: number }[]>()
for (const row of rows) {
  for (const r of ratings.get(row.member.id) ?? []) {
    const key = groupOf(r.source, row.player.posicao)
    groups.set(key, [...(groups.get(key) ?? []), { row, value: r.value }])
  }
}
const targets = new Map<Row, { sum: number; minutes: number }>()
for (const [key, members] of groups) {
  if (members.length < MIN_GROUP) continue
  const [vm, vs] = [average(members.map((m) => m.value)), spread(members.map((m) => m.value)) || 1]
  const notas = members.map((m) => m.row.player.nota)
  const [rm, rs] = [average(notas), spread(notas)]
  const source = key.split(':')[0]
  for (const { row, value } of members) {
    const own = (ratings.get(row.member.id) ?? []).find(
      (r) => groupOf(r.source, row.player.posicao) === key && r.value === value,
    )
    const played = (own?.minutes ?? 0) * (source.endsWith('-anterior') ? LAST_SEASON_WEIGHT : 1)
    const target = rm + ((value - vm) / vs) * rs
    const sum = targets.get(row) ?? { sum: 0, minutes: 0 }
    targets.set(row, { sum: sum.sum + target * played, minutes: sum.minutes + played })
  }
}

type Change = { row: Row; club: Club; before: number; after: number }
const changes: Change[] = []
for (const club of allClubs) {
  for (const row of club.rows) {
    const t = targets.get(row)
    if (!t || t.minutes === 0) continue
    row.target = t.sum / t.minutes
    row.weight = FOTMOB_WEIGHT * Math.min(1, t.minutes / FOTMOB_FULL_MINUTES)
    const before = row.player.nota
    const step = Math.max(-MAX_STEP, Math.min(MAX_STEP, (row.target - before) * row.weight))
    row.player.nota = clamp(before + step)
    if (row.player.nota !== before) changes.push({ row, club, before, after: row.player.nota })
  }
}

// --- Clubs -----------------------------------------------------------------

/** A club's strength: the average of its best 16. */
for (const club of allClubs) {
  const best = club.rows.map((r) => r.player.nota).sort((a, b) => b - a)
  club.strength = average(best.slice(0, 16))
}
const byStrength = (a: Club, b: Club) => b.strength - a.strength
const inLeague = allClubs.filter((c) => leaguePhase.has(c.team.details.id))
const knockedOut = allClubs.filter((c) => !leaguePhase.has(c.team.details.id)).sort(byStrength)
const chosen = [...inLeague, ...knockedOut.slice(0, CLUB_COUNT - inLeague.length)].sort(byStrength)
if (chosen.length !== CLUB_COUNT) console.log(`atenção: ${chosen.length} clubes, não ${CLUB_COUNT}`)

/** Black or white, whichever reads better on the club colour. */
const contrast = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#000000' : '#ffffff'
}
const shortName = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z ]/g, '')
    .split(' ')
    .filter((w) => w.length > 2 && !['FC', 'CF', 'AFC', 'SC', 'AC', 'CLUB'].includes(w))[0]
    ?.slice(0, 3) ?? 'CLB'

const packClubs: PackClub[] = chosen.map(({ team, rows: squad }) => {
  const { details } = team
  const override = CLUBS[details.id] ?? {}
  const nome = override.nome ?? details.shortName ?? details.name
  const color = /^#[0-9a-f]{6}$/i.test(details.teamColor ?? '') ? details.teamColor! : '#333333'
  const city = details.sportsTeamJSONLD?.location?.address?.addressLocality?.split(',')[0].trim()
  return {
    nome,
    sigla: override.sigla ?? shortName(nome),
    ...((override.cidade ?? city) ? { cidade: override.cidade ?? city } : {}),
    cores: override.cores ?? [color.toLowerCase(), contrast(color)],
    jogadores: squad
      .map((r) => r.player)
      .sort(
        (a, b) =>
          POSITION_ORDER.indexOf(a.posicao) - POSITION_ORDER.indexOf(b.posicao) || b.nota - a.nota,
      ),
  }
})

// --- Report and file -------------------------------------------------------

const leagueOf = (c: Club) => c.team.details.primaryLeagueId ?? '?'
console.log(`${chosen.length} clubes, ${chosen.reduce((n, c) => n + c.rows.length, 0)} jogadores`)
console.log(`  com nota do FotMob: ${rows.filter((r) => r.target !== undefined).length}`)
console.log(`  só valor de mercado: ${rows.filter((r) => r.target === undefined).length}`)
console.log(`  sem valor de mercado: ${rows.filter((r) => !r.member.transferValue).length}`)
for (const [label, part] of [
  ['1ª divisão', chosen.slice(0, FIRST_DIVISION)],
  ['2ª divisão', chosen.slice(FIRST_DIVISION)],
] as const) {
  const notas = part.flatMap((c) => c.rows.map((r) => r.player.nota))
  console.log(`${label}: nota média ${average(notas).toFixed(2)}`)
}
console.log('\nclubes (força = média dos 16 melhores):')
chosen.forEach((c, i) => {
  const flag = leaguePhase.has(c.team.details.id) ? '' : ' · eliminado nos play-offs'
  const top = [...c.rows].sort((a, b) => b.player.nota - a.player.nota)[0]
  console.log(
    `  ${String(i + 1).padStart(2)}. ${c.strength.toFixed(1)}  ${c.team.details.name} (liga ${leagueOf(c)}, ${c.rows.length} jog.) · ${top?.player.nome} ${top?.player.nota}${flag}`,
  )
})
if (knockedOut.length > CLUB_COUNT - inLeague.length) {
  console.log('\neliminados nos play-offs que ficaram de fora:')
  knockedOut
    .slice(CLUB_COUNT - inLeague.length)
    .forEach((c) => console.log(`  ${c.strength.toFixed(1)}  ${c.team.details.name}`))
}
const line = (r: Row, club: Club) =>
  `${r.player.nome} (${club.team.details.name}, ${r.player.posicao}, ${r.player.idade ?? '?'})`
const everyone = chosen.flatMap((club) => club.rows.map((row) => ({ row, club })))
console.log('\n40 melhores:')
everyone
  .sort((a, b) => b.row.player.nota - a.row.player.nota)
  .slice(0, 40)
  .forEach(({ row, club }) =>
    console.log(
      `  ${row.player.nota}  ${line(row, club)} · valor ${((row.member.transferValue ?? 0) / 1e6).toFixed(1)}M, base ${row.base.toFixed(1)}`,
    ),
  )
const sorted = changes
  .filter((c) => chosen.includes(c.club))
  .sort((a, b) => b.after - b.before - (a.after - a.before))
const changeLine = (c: Change) =>
  `  ${String(c.before).padStart(2)} -> ${String(c.after).padStart(2)}  ${line(c.row, c.club)} · alvo ${c.row.target!.toFixed(1)}, peso ${c.row.weight.toFixed(2)}`
console.log('\nmais subiram pelo desempenho:')
sorted.slice(0, 20).forEach((c) => console.log(changeLine(c)))
console.log('\nmais caíram pelo desempenho:')
sorted
  .slice(-20)
  .reverse()
  .forEach((c) => console.log(changeLine(c)))

if (write) {
  const pack = {
    formato: 'futmanager-pacote',
    versao: 1,
    nome: 'Champions League 2026/27',
    leiame:
      'Os 36 clubes da fase de liga da Champions League 2026/27 e os 4 mais fortes eliminados nos play-offs, com os elencos do FotMob. Cada jogador tem uma nota numa escala parecida com a do EA FC (de 50 a 90), tirada do valor de mercado e da nota média no FotMob.',
    clubes: packClubs,
  }
  // Same layout as the Brasileirão file: one player per line.
  const text = JSON.stringify(pack, null, 2)
    .replace(/"cores": \[\s*("[^"]*"),\s*("[^"]*")\s*\]/g, '"cores": [$1, $2]')
    .replace(/\{\s*("nome": [^{}[\]]*?"nota": \d+)\s*\}/g, (_, body: string) => {
      return `{ ${body.replace(/,\s+/g, ', ')} }`
    })
  writeFileSync(PACK, `${text}\n`)
  console.log(`\n${PACK} atualizado`)
}
