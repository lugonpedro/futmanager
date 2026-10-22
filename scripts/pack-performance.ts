/**
 * Moves the ratings of the Brasileirão pack toward what each player has been
 * doing on the pitch this season, so the EA FC caps stop deciding who is good.
 * It reads raw downloads (FotMob rankings and squads for both divisions, and
 * the Cartola market for Série A) from a folder that is not kept in the repo:
 *
 *   npm run pack:performance -- ../dados-brutos [--write]
 *
 * Within each division and position, a player's FotMob average becomes a
 * z-score that is laid over the spread of the pack's current ratings, and the
 * new rating blends that target with the old one by minutes played. Players
 * with too few minutes for FotMob fall back to their Cartola average, with
 * less weight, and players found in neither keep their rating.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const PACK = 'src/packs/brasileirao-2026.json'
const SERIE_A = '268'
const SERIE_B = '8814'
/** How far the performance target can pull a rating, at full minutes. */
const FOTMOB_WEIGHT = 0.6
const FOTMOB_FULL_MINUTES = 1800
const CARTOLA_WEIGHT = 0.3
const CARTOLA_FULL_GAMES = 20
const CARTOLA_MIN_GAMES = 5
/** No single season moves a rating more than this. */
const MAX_STEP = 7
const MIN_RATING = 50
const MAX_RATING = 90

type Position = 'G' | 'Z' | 'L' | 'M' | 'A'
type PackPlayer = { nome: string; posicao: Position; idade?: number; nota: number }
type PackClub = { nome: string; sigla: string; jogadores: PackPlayer[] }
type PackFile = { clubes: PackClub[] }

type FotmobMember = { id: number; name: string; age?: number }
type FotmobTeam = {
  details: { id: number; name: string; shortName?: string }
  squad: { squad: { title: string; members: FotmobMember[] }[] }
}
type FotmobRank = {
  TopLists: {
    StatList: { ParticiantId: number; StatValue: number; MinutesPlayed: number; TeamId: number }[]
  }[]
}
type CartolaAthlete = {
  apelido: string
  nome: string
  clube_id: number
  posicao_id: number
  media_num: number
  jogos_num: number
}
type Cartola = {
  clubes: Record<string, { id: number; nome: string; apelido?: string }>
  atletas: CartolaAthlete[]
}

const args = process.argv.slice(2)
const folder = args.find((a) => !a.startsWith('--'))
if (!folder) throw new Error('usage: npm run pack:performance -- <raw-data-folder> [--write]')
const write = args.includes('--write')

const readJson = <T>(name: string) => JSON.parse(readFileSync(join(folder, name), 'utf8')) as T

/** Lowercase, no accents, no punctuation: "Léo Ortiz" and "Leo Ortiz" meet. */
const plain = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Pack club names that FotMob or Cartola spell another way. */
const CLUB_ALIASES: Record<string, string[]> = {
  Vasco: ['vasco da gama'],
  Bragantino: ['rb bragantino', 'red bull bragantino'],
  'Athletico-PR': ['athletico paranaense', 'athletico'],
  Sport: ['sport recife'],
  'Botafogo-SP': ['botafogo sp'],
  Athletic: ['athletic club mg', 'athletic club'],
}
const clubKeys = (name: string) => [plain(name), ...(CLUB_ALIASES[name] ?? []).map(plain)]
/** Pack nicknames that share no word with the name the sources use. */
const PLAYER_ALIASES: Record<string, string> = { Gabigol: 'Gabriel Barbosa' }

/**
 * Finds the one candidate that is the same person as the pack player: same
 * name, or a name that holds all of the pack name's words (FotMob writes
 * "Agustín Rossi" where the pack says "Rossi"). An age more than a year off
 * rules a candidate out, and a tie matches no one.
 */
function findMatch<T>(
  player: PackPlayer,
  candidates: T[],
  names: (c: T) => string[],
  age: (c: T) => number | undefined,
  exactOnly = false,
): T | undefined {
  const target = plain(PLAYER_ALIASES[player.nome] ?? player.nome)
  const words = target.split(' ')
  const ageOk = (c: T) => {
    const a = age(c)
    return a === undefined || player.idade === undefined || Math.abs(a - player.idade) <= 1
  }
  const pool = candidates.filter(ageOk)
  const exact = pool.filter((c) => names(c).some((n) => plain(n) === target))
  if (exact.length === 1) return exact[0]
  if (exact.length > 1 || exactOnly) return undefined
  const containing = pool.filter((c) =>
    names(c).some((n) => {
      const theirs = plain(n).split(' ')
      return words.every((w) => theirs.includes(w))
    }),
  )
  return containing.length === 1 ? containing[0] : undefined
}

const average = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const spread = (xs: number[]) => {
  const m = average(xs)
  return Math.sqrt(average(xs.map((x) => (x - m) ** 2)))
}

// --- Sources ---------------------------------------------------------------

const teams = readdirSync(folder)
  .filter((f) => /^fotmob-time-\d+\.json$/.test(f))
  .map((f) => readJson<FotmobTeam>(f))
const everyMember = teams.flatMap((t) =>
  t.squad.squad.filter((g) => g.title !== 'coach').flatMap((g) => g.members),
)
const findTeam = (club: PackClub) =>
  teams.find((t) =>
    clubKeys(club.nome).some(
      (k) => plain(t.details.name) === k || plain(t.details.shortName ?? '') === k,
    ),
  )

const fotmobRatings = new Map<number, { value: number; minutes: number }>()
for (const league of [SERIE_A, SERIE_B]) {
  const list = readJson<FotmobRank>(`fotmob-${league}-rating.json`).TopLists[0].StatList
  for (const row of list) {
    fotmobRatings.set(row.ParticiantId, { value: row.StatValue, minutes: row.MinutesPlayed })
  }
}

const cartola = readJson<Cartola>('cartola-mercado.json')
const cartolaClub = (club: PackClub) =>
  Object.values(cartola.clubes).find((c) =>
    clubKeys(club.nome).some((k) => plain(c.nome) === k || plain(c.apelido ?? '') === k),
  )
/** Cartola splits defenders like the pack does, and lumps midfield together. */
const CARTOLA_POSITION: Record<number, Position> = { 1: 'G', 2: 'L', 3: 'Z', 4: 'M', 5: 'A' }

// --- Matching --------------------------------------------------------------

const pack = JSON.parse(readFileSync(PACK, 'utf8')) as PackFile
const division = (clubIndex: number) => (clubIndex < 20 ? 1 : 2)

type Row = {
  club: PackClub
  player: PackPlayer
  division: number
  fotmob?: { value: number; minutes: number }
  cartola?: CartolaAthlete
}
const rows: Row[] = []
const missingClubs: string[] = []
for (const [index, club] of pack.clubes.entries()) {
  const team = findTeam(club)
  if (!team) missingClubs.push(club.nome)
  const members = team?.squad.squad.filter((g) => g.title !== 'coach').flatMap((g) => g.members)
  const cartolaId = division(index) === 1 ? cartolaClub(club)?.id : undefined
  const athletes = cartola.atletas.filter((a) => a.clube_id === cartolaId)
  for (const player of club.jogadores) {
    // A player the pack still lists at his old club is looked for everywhere,
    // by exact name only, since a club-less search on parts of names misfires.
    const member =
      (members &&
        findMatch(
          player,
          members,
          (m) => [m.name],
          (m) => m.age,
        )) ||
      findMatch(
        player,
        everyMember.filter((m) => fotmobRatings.has(m.id)),
        (m) => [m.name],
        (m) => m.age,
        true,
      )
    const athlete = findMatch(
      player,
      athletes.filter((a) => CARTOLA_POSITION[a.posicao_id] !== undefined),
      (a) => [a.apelido, a.nome],
      () => undefined,
    )
    rows.push({
      club,
      player,
      division: division(index),
      fotmob: member ? fotmobRatings.get(member.id) : undefined,
      cartola: athlete && athlete.jogos_num >= CARTOLA_MIN_GAMES ? athlete : undefined,
    })
  }
}

// --- New ratings -----------------------------------------------------------

/**
 * Turns a source value into a rating target: its z-score among the players of
 * the same division and position that the source covers, laid over the spread
 * of those same players' current ratings.
 */
function targets(pick: (r: Row) => number | undefined, group: (r: Row) => string) {
  const out = new Map<Row, number>()
  const groups = new Map<string, Row[]>()
  for (const r of rows) {
    if (pick(r) === undefined) continue
    groups.set(group(r), [...(groups.get(group(r)) ?? []), r])
  }
  for (const members of groups.values()) {
    if (members.length < 5) continue
    const values = members.map((r) => pick(r)!)
    const ratings = members.map((r) => r.player.nota)
    const [vm, vs] = [average(values), spread(values) || 1]
    const [rm, rs] = [average(ratings), spread(ratings)]
    for (const r of members) out.set(r, rm + ((pick(r)! - vm) / vs) * rs)
  }
  return out
}
const byPosition = (r: Row) => `${r.division}${r.player.posicao}`
const fotmobTarget = targets((r) => r.fotmob?.value, byPosition)
const cartolaTarget = targets(
  (r) => r.cartola?.media_num,
  (r) => (r.player.posicao === 'L' || r.player.posicao === 'Z' ? 'D' : r.player.posicao),
)

type Change = { row: Row; before: number; after: number; source: string }
const changes: Change[] = []
for (const row of rows) {
  const before = row.player.nota
  let target: number | undefined
  let weight = 0
  let source = ''
  if (fotmobTarget.has(row)) {
    target = fotmobTarget.get(row)!
    weight = FOTMOB_WEIGHT * Math.min(1, row.fotmob!.minutes / FOTMOB_FULL_MINUTES)
    source = `FotMob ${row.fotmob!.value.toFixed(2)} em ${row.fotmob!.minutes} min`
  } else if (cartolaTarget.has(row)) {
    target = cartolaTarget.get(row)!
    weight = CARTOLA_WEIGHT * Math.min(1, row.cartola!.jogos_num / CARTOLA_FULL_GAMES)
    source = `Cartola ${row.cartola!.media_num.toFixed(2)} em ${row.cartola!.jogos_num} jogos`
  }
  if (target === undefined) continue
  const step = Math.max(-MAX_STEP, Math.min(MAX_STEP, (target - before) * weight))
  const after = Math.max(MIN_RATING, Math.min(MAX_RATING, Math.round(before + step)))
  if (after !== before) changes.push({ row, before, after, source })
  row.player.nota = after
}

// --- Report and file -------------------------------------------------------

const count = (pick: (r: Row) => unknown) => rows.filter((r) => pick(r)).length
console.log(`${rows.length} jogadores no pacote`)
console.log(`  com nota do FotMob: ${count((r) => fotmobTarget.has(r))}`)
console.log(`  só com o Cartola:   ${count((r) => !fotmobTarget.has(r) && cartolaTarget.has(r))}`)
console.log(`  sem dados:          ${count((r) => !fotmobTarget.has(r) && !cartolaTarget.has(r))}`)
console.log(`  mudaram:            ${changes.length}`)
if (missingClubs.length) console.log(`clubes sem elenco no FotMob: ${missingClubs.join(', ')}`)
for (const d of [1, 2]) {
  const before = rows.filter((r) => r.division === d)
  const old = average(before.map((r) => changes.find((c) => c.row === r)?.before ?? r.player.nota))
  const now = average(before.map((r) => r.player.nota))
  console.log(`Série ${d === 1 ? 'A' : 'B'}: média ${old.toFixed(2)} -> ${now.toFixed(2)}`)
}
const line = (c: Change) =>
  `  ${String(c.before).padStart(2)} -> ${String(c.after).padStart(2)}  ${c.row.player.nome} (${c.row.club.nome}, ${c.row.player.posicao}) · ${c.source}`
const sorted = [...changes].sort((a, b) => b.after - b.before - (a.after - a.before))
console.log('\nmais subiram:')
sorted.slice(0, 25).forEach((c) => console.log(line(c)))
console.log('\nmais caíram:')
sorted
  .slice(-25)
  .reverse()
  .forEach((c) => console.log(line(c)))

// Regulars FotMob rates that matched no one: new signings, or a spelling to fix.
const matched = new Set(rows.flatMap((r) => (r.fotmob ? [r.fotmob] : [])))
const memberName = new Map(
  teams.flatMap((t) =>
    t.squad.squad.flatMap((g) =>
      g.members.map((m) => [m.id, `${m.name} (${t.details.name})`] as const),
    ),
  ),
)
const unmatched = [...fotmobRatings.entries()]
  .filter(([, r]) => !matched.has(r) && r.minutes >= 1000)
  .sort((a, b) => b[1].minutes - a[1].minutes)
console.log(`\ntitulares do FotMob sem par no pacote (${unmatched.length}):`)
unmatched.forEach(([id, r]) =>
  console.log(`  ${memberName.get(id) ?? id} · ${r.value.toFixed(2)} em ${r.minutes} min`),
)

if (write) {
  // Same layout as the hand-kept file: one player per line.
  const text = readFileSync(PACK, 'utf8')
  let i = 0
  const flat = rows.map((r) => r.player)
  const updated = text.replace(/("nota": )\d+/g, (_, key: string) => `${key}${flat[i++].nota}`)
  if (i !== flat.length) throw new Error(`expected ${flat.length} ratings, found ${i}`)
  writeFileSync(PACK, updated)
  console.log(`\n${PACK} atualizado`)
}
