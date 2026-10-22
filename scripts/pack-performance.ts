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

type FotmobMember = {
  id: number
  name: string
  age?: number
  positionIds?: string | null
  positionIdsDesc?: string | null
}
type FotmobTeam = {
  details: { id: number; name: string; shortName?: string }
  squad: { squad: { title: string; members: FotmobMember[] }[] }
}
type FotmobRank = {
  TopLists: {
    StatList: {
      ParticiantId: number
      ParticipantName: string
      StatValue: number
      MinutesPlayed: number
      TeamId: number
      TeamName: string
      Positions?: number[]
    }[]
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
const rankedRows = [SERIE_A, SERIE_B].flatMap(
  (league) => readJson<FotmobRank>(`fotmob-${league}-rating.json`).TopLists[0].StatList,
)
for (const row of rankedRows) {
  fotmobRatings.set(row.ParticiantId, { value: row.StatValue, minutes: row.MinutesPlayed })
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
  /** The FotMob player he was matched to, and whether that one is on this club's squad page. */
  memberId?: number
  inSquad: boolean
}
const rows: Row[] = []
const missingClubs: string[] = []
/** FotMob's squad groups, and the pack positions each can hold. */
const GROUP_POSITIONS: Record<string, Position[]> = {
  keepers: ['G'],
  defenders: ['Z', 'L'],
  midfielders: ['M', 'L', 'A'],
  attackers: ['A', 'M'],
  // Rated by FotMob but gone from the squad page, so no group or age.
  unknown: ['G', 'Z', 'L', 'M', 'A'],
}
type Member = FotmobMember & { group: string }
const words = (name: string) => plain(name).split(' ')
/**
 * Second chance for pack players left without a FotMob match: the pack and
 * FotMob may each use a name the other only partly shares ("Flaco López" and
 * "José Manuel López", "Gabriel Boschilia" and "Boschilia"). A pair counts
 * when they share a surname-like word, play compatible positions, are within
 * a year of age, and neither has another candidate. The same full name at the
 * same club and position is enough, since the pack's ages are sometimes off.
 * Without FotMob's age, the shared word has to be FotMob's last name.
 */
function looseMatches(players: PackPlayer[], members: Member[]) {
  const fits = (p: PackPlayer, m: Member) => {
    if (!(GROUP_POSITIONS[m.group] ?? []).includes(p.posicao)) return false
    if (plain(p.nome) === plain(m.name)) return true
    const theirs = words(m.name)
    const shared = words(p.nome).filter((w) => w.length >= 4 && theirs.includes(w))
    if (shared.length === 0) return false
    if (m.age === undefined) return shared.includes(theirs[theirs.length - 1])
    return p.idade !== undefined && Math.abs(m.age - p.idade) <= 1
  }
  const pairs = new Map<PackPlayer, Member>()
  for (const p of players) {
    const options = members.filter((m) => fits(p, m))
    if (options.length !== 1) continue
    const rivals = players.filter((other) => fits(other, options[0]))
    if (rivals.length === 1) pairs.set(p, options[0])
  }
  return pairs
}
const looseFound: { row: Row; member: Member }[] = []
const squads = new Map<PackClub, Member[]>()
for (const [index, club] of pack.clubes.entries()) {
  const team = findTeam(club)
  if (!team) missingClubs.push(club.nome)
  const squad: Member[] =
    team?.squad.squad
      .filter((g) => g.title !== 'coach')
      .flatMap((g) => g.members.map((m) => ({ ...m, group: g.title }))) ?? []
  const inSquad = new Set(squad.map((m) => m.id))
  const members: Member[] = [
    ...squad,
    ...rankedRows
      .filter((r) => r.TeamId === team?.details.id && !inSquad.has(r.ParticiantId))
      .map((r) => ({
        id: r.ParticiantId,
        name: r.ParticipantName,
        group: 'unknown',
        positionIds: r.Positions?.join(','),
      })),
  ]
  squads.set(club, members)
  const cartolaId = division(index) === 1 ? cartolaClub(club)?.id : undefined
  const athletes = cartola.atletas.filter((a) => a.clube_id === cartolaId)
  const used = new Set<number>()
  const clubRows: Row[] = []
  for (const player of club.jogadores) {
    // A player the pack still lists at his old club is looked for everywhere,
    // by exact full name only, since a club-less search on parts of names (or
    // on a lone "Willian") misfires, and only when his own club has no one of
    // that name (who would be him, with the pack's age off).
    const member =
      findMatch(
        player,
        members,
        (m) => [m.name],
        (m) => m.age,
      ) ||
      (words(player.nome).length > 1 &&
        !members.some((m) => plain(m.name) === plain(player.nome)) &&
        findMatch(
          player,
          everyMember.filter((m) => fotmobRatings.has(m.id)),
          (m) => [m.name],
          (m) => m.age,
          true,
        )) ||
      undefined
    if (member) used.add(member.id)
    const athlete = findMatch(
      player,
      athletes.filter((a) => CARTOLA_POSITION[a.posicao_id] !== undefined),
      (a) => [a.apelido, a.nome],
      () => undefined,
    )
    clubRows.push({
      club,
      player,
      division: division(index),
      fotmob: member ? fotmobRatings.get(member.id) : undefined,
      cartola: athlete && athlete.jogos_num >= CARTOLA_MIN_GAMES ? athlete : undefined,
      memberId: member?.id,
      inSquad: member !== undefined && inSquad.has(member.id),
    })
  }
  const left = clubRows.filter((r) => !r.fotmob)
  const loose = looseMatches(
    left.map((r) => r.player),
    members.filter((m) => !used.has(m.id) && fotmobRatings.has(m.id)),
  )
  for (const row of left) {
    const member = loose.get(row.player)
    if (!member) continue
    row.fotmob = fotmobRatings.get(member.id)
    row.memberId = member.id
    row.inSquad = inSquad.has(member.id)
    looseFound.push({ row, member })
  }
  rows.push(...clubRows)
}

// --- New ratings -----------------------------------------------------------

/**
 * Turns a source value into a rating target: its z-score among the players of
 * the same division and position that the source covers, laid over the spread
 * of those same players' current ratings.
 */
type GroupStats = { vm: number; vs: number; rm: number; rs: number }
function targets(
  pick: (r: Row) => number | undefined,
  group: (r: Row) => string,
  stats = new Map<string, GroupStats>(),
) {
  const out = new Map<Row, number>()
  const groups = new Map<string, Row[]>()
  for (const r of rows) {
    if (pick(r) === undefined) continue
    groups.set(group(r), [...(groups.get(group(r)) ?? []), r])
  }
  for (const [key, members] of groups) {
    if (members.length < 5) continue
    const values = members.map((r) => pick(r)!)
    const ratings = members.map((r) => r.player.nota)
    const [vm, vs] = [average(values), spread(values) || 1]
    const [rm, rs] = [average(ratings), spread(ratings)]
    stats.set(key, { vm, vs, rm, rs })
    for (const r of members) out.set(r, rm + ((pick(r)! - vm) / vs) * rs)
  }
  return out
}
const byPosition = (r: Row) => `${r.division}${r.player.posicao}`
const fotmobStats = new Map<string, GroupStats>()
const fotmobTarget = targets((r) => r.fotmob?.value, byPosition, fotmobStats)
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
const NATURAL_GROUP: Record<Position, string> = {
  G: 'keepers',
  Z: 'defenders',
  L: 'defenders',
  M: 'midfielders',
  A: 'attackers',
}
const POSITION_ORDER: Position[] = ['G', 'Z', 'L', 'M', 'A']
/**
 * A real squad, capped where the game's market caps it (32), with room per
 * position for the depth Brazilian clubs carry.
 */
const SQUAD_MAX = 32
const POSITION_MAX: Record<Position, number> = { G: 4, Z: 7, L: 6, M: 10, A: 9 }
/** FotMob's numeric position ids, read off the squad pages that carry both. */
const POSITION_NAMES = new Map<string, string>()
for (const m of everyMember) {
  const ids = m.positionIds?.split(',') ?? []
  const names = m.positionIdsDesc?.split(',') ?? []
  ids.forEach((id, i) => names[i] && POSITION_NAMES.set(id, names[i]))
}
const positionOf = (m: Member) => {
  const name =
    m.positionIdsDesc?.split(',')[0] ?? POSITION_NAMES.get(m.positionIds?.split(',')[0] ?? '')
  return FOTMOB_POSITION[name ?? ''] ?? GROUP_POSITION[m.group] ?? 'M'
}

/**
 * Brings each squad up to date with FotMob. Pack players its squad page
 * doesn't list at their club have left: they move if it lists them at another
 * club of the pack, and go otherwise. Then every player FotMob rated this
 * season at a club joins it if the pack doesn't have him there, rated from
 * the club's level at his position and his FotMob average. A full position
 * or squad (see SQUAD_MAX) gives his place to someone with no minutes in
 * either source and no higher rating, or else to the lowest rated one below
 * him.
 */
type Added = { club: PackClub; player: PackPlayer; source: string }
type Dropped = { club: PackClub; player: PackPlayer; reason: string }
const added: Added[] = []
const dropped: Dropped[] = []
const moved: { from: PackClub; to: PackClub; player: PackPlayer }[] = []
const full: { club: PackClub; name: string }[] = []
const rowByMember = new Map(rows.flatMap((r) => (r.memberId ? [[r.memberId, r] as const] : [])))
const rowsOf = (club: PackClub) => rows.filter((r) => r.club === club)

// Pack players FotMob's squad page for their club doesn't list have left it:
// those it lists at another club of the pack move there, the rest go.
const clubOfTeam = new Map(
  pack.clubes.flatMap((c) => {
    const team = findTeam(c)
    return team ? [[team.details.id, c] as const] : []
  }),
)
const teamOfMember = new Map(
  teams.flatMap((t) => t.squad.squad.flatMap((g) => g.members.map((m) => [m.id, t] as const))),
)
for (const row of rows.filter((r) => r.memberId === undefined)) {
  const sameName = everyMember.filter(
    (m) =>
      plain(m.name) === plain(row.player.nome) &&
      (m.age === undefined ||
        row.player.idade === undefined ||
        Math.abs(m.age - row.player.idade) <= 1),
  )
  const team = sameName.length === 1 ? teamOfMember.get(sameName[0].id) : undefined
  const to = team && clubOfTeam.get(team.details.id)
  // A club that already has him by name got him twice in the pack: one goes.
  const twice = to && rowsOf(to).some((r) => plain(r.player.nome) === plain(row.player.nome))
  if (to && to !== row.club && !twice && rowsOf(to).length < SQUAD_MAX) {
    moved.push({ from: row.club, to, player: row.player })
    row.club = to
    row.division = division(pack.clubes.indexOf(to))
    row.memberId = sameName[0].id
    row.inSquad = true
    continue
  }
  rows.splice(rows.indexOf(row), 1)
  dropped.push({
    club: row.club,
    player: row.player,
    reason: twice ? `repetido em ${to!.nome}` : 'fora do elenco no FotMob',
  })
}
for (const [index, club] of pack.clubes.entries()) {
  const squad = squads.get(club) ?? []
  const here = new Set(rowsOf(club).flatMap((r) => (r.memberId ? [r.memberId] : [])))
  const newcomers = squad
    .filter((m) => fotmobRatings.has(m.id) && !here.has(m.id))
    .sort((a, b) => fotmobRatings.get(b.id)!.minutes - fotmobRatings.get(a.id)!.minutes)
  for (const member of newcomers) {
    const rating = fotmobRatings.get(member.id)!
    const elsewhere = rowByMember.get(member.id)
    // Still on his own club's squad page: FotMob lists him at both, so he stays.
    if (elsewhere?.inSquad) continue
    const mine = rowsOf(club)
    const hasRoom = (p: Position) =>
      mine.filter((r) => r.player.posicao === p).length < POSITION_MAX[p]
    // A full position sends him to another one he can play that has room.
    const natural = elsewhere?.player.posicao ?? positionOf(member)
    const position = hasRoom(natural)
      ? natural
      : ((
          GROUP_POSITIONS[member.group === 'unknown' ? NATURAL_GROUP[natural] : member.group] ?? []
        ).find(hasRoom) ?? natural)
    const taken = mine.filter((r) => r.player.posicao === position)
    const stats = fotmobStats.get(`${division(index)}${position}`)
    const level = average((taken.length ? taken : mine).map((r) => r.player.nota))
    const z = stats ? (rating.value - stats.vm) / stats.vs : 0
    const lift = z * (stats?.rs ?? 0) * Math.min(1, rating.minutes / FOTMOB_FULL_MINUTES)
    const nota =
      elsewhere?.player.nota ?? Math.max(MIN_RATING, Math.min(MAX_RATING, Math.round(level + lift)))
    const positionFull = taken.length >= POSITION_MAX[position]
    if (positionFull || mine.length >= SQUAD_MAX) {
      // With the squad full but not his position, anyone but a club's last two keepers can go.
      const keepers = mine.filter((r) => r.player.posicao === 'G').length
      const pool = positionFull
        ? taken
        : mine.filter((r) => r.player.posicao !== 'G' || keepers > 2)
      // First someone the club's squad page no longer lists, then someone
      // still there but without minutes, as long as he isn't rated higher,
      // and last the weakest of the position if he is rated lower.
      const byRating = (a: Row, b: Row) => a.player.nota - b.player.nota
      const gone = pool.filter((r) => r.memberId === undefined).sort(byRating)
      const idle = pool
        .filter((r) => r.memberId !== undefined && !r.fotmob && !r.cartola)
        .filter((r) => r.player.nota <= nota)
        .sort(byRating)
      const weaker = pool.filter((r) => r.player.nota < nota).sort(byRating)
      const out = gone[0] ?? idle[0] ?? weaker[0]
      if (!out) {
        full.push({ club, name: member.name })
        continue
      }
      rows.splice(rows.indexOf(out), 1)
      dropped.push({
        club,
        player: out.player,
        reason:
          out === gone[0]
            ? 'fora do elenco no FotMob'
            : out === idle[0]
              ? 'sem minutos'
              : `nota menor que a de ${member.name}`,
      })
    }
    if (elsewhere) {
      moved.push({ from: elsewhere.club, to: club, player: elsewhere.player })
      elsewhere.club = club
      elsewhere.division = division(index)
      elsewhere.inSquad = true
      if (member.age !== undefined) elsewhere.player.idade = member.age
      continue
    }
    const player: PackPlayer = {
      nome: member.name,
      posicao: position,
      ...(member.age !== undefined ? { idade: member.age } : {}),
      nota,
    }
    rows.push({
      club,
      player,
      division: division(index),
      fotmob: rating,
      memberId: member.id,
      inSquad: true,
    })
    added.push({
      club,
      player,
      source: `FotMob ${rating.value.toFixed(2)} em ${rating.minutes} min`,
    })
  }
}

/**
 * A squad left short of a generated one (25) is filled from the rest of its
 * FotMob squad page, players without a rating yet, at the position it is
 * thinnest at, a little below the club's level there; otherwise the game
 * would fill it with invented names.
 */
const GENERATED_SHAPE: Record<Position, number> = { G: 3, Z: 5, L: 4, M: 7, A: 6 }
const GENERATED_SIZE = Object.values(GENERATED_SHAPE).reduce((a, b) => a + b, 0)
const BENCH_GAP = 4
for (const [index, club] of pack.clubes.entries()) {
  const here = new Set(rowsOf(club).flatMap((r) => (r.memberId ? [r.memberId] : [])))
  const bench = (squads.get(club) ?? []).filter(
    (m) => m.group !== 'unknown' && !here.has(m.id) && !rowByMember.has(m.id),
  )
  while (rowsOf(club).length < GENERATED_SIZE && bench.length > 0) {
    const mine = rowsOf(club)
    const count = (p: Position) => mine.filter((r) => r.player.posicao === p).length
    const thinnest = [...POSITION_ORDER].sort(
      (a, b) => count(a) / GENERATED_SHAPE[a] - count(b) / GENERATED_SHAPE[b],
    )[0]
    const pick = bench.find((m) => positionOf(m) === thinnest) ?? bench[0]
    bench.splice(bench.indexOf(pick), 1)
    const position = positionOf(pick)
    const peers = mine.filter((r) => r.player.posicao === position)
    const level = average((peers.length ? peers : mine).map((r) => r.player.nota))
    const player: PackPlayer = {
      nome: pick.name,
      posicao: position,
      ...(pick.age !== undefined ? { idade: pick.age } : {}),
      nota: Math.max(MIN_RATING, Math.round(level - BENCH_GAP)),
    }
    rows.push({ club, player, division: division(index), memberId: pick.id, inSquad: true })
    added.push({ club, player, source: 'elenco do FotMob, sem nota' })
  }
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

console.log(`\npareados por sobrenome (${looseFound.length}):`)
looseFound.forEach(({ row, member }) =>
  console.log(`  ${row.player.nome} (${row.club.nome}, ${row.player.posicao}) = ${member.name}`),
)

console.log(`\nentraram nos elencos (${added.length}):`)
added.forEach((a) =>
  console.log(
    `  ${a.player.nota}  ${a.player.nome} (${a.club.nome}, ${a.player.posicao}, ${a.player.idade ?? '?'}) · ${a.source}`,
  ),
)
console.log(`\ntrocaram de clube (${moved.length}):`)
moved.forEach((m) =>
  console.log(`  ${m.player.nome} (${m.player.posicao}): ${m.from.nome} -> ${m.to.nome}`),
)
console.log(`\nsaíram para abrir vaga (${dropped.length}):`)
dropped.forEach((d) =>
  console.log(
    `  ${d.player.nota}  ${d.player.nome} (${d.club.nome}, ${d.player.posicao}) · ${d.reason}`,
  ),
)
if (full.length) {
  console.log(`\nsem vaga na posição (${full.length}):`)
  full.forEach((f) => console.log(`  ${f.name} (${f.club.nome})`))
}

// Regulars FotMob rates that matched no one: new signings, or a spelling to fix.
const matched = new Set(rows.flatMap((r) => (r.fotmob ? [r.fotmob] : [])))
const memberName = new Map(
  rankedRows.map((r) => [r.ParticiantId, `${r.ParticipantName} (${r.TeamName})`] as const),
)
const unmatched = [...fotmobRatings.entries()]
  .filter(([, r]) => !matched.has(r) && r.minutes >= 1000)
  .sort((a, b) => b[1].minutes - a[1].minutes)
console.log(`\ntitulares do FotMob sem par no pacote (${unmatched.length}):`)
unmatched.forEach(([id, r]) =>
  console.log(`  ${memberName.get(id) ?? id} · ${r.value.toFixed(2)} em ${r.minutes} min`),
)

if (write) {
  // Same layout as the hand-kept file: one player per line, by position.
  for (const club of pack.clubes) {
    club.jogadores = rowsOf(club)
      .map((r) => r.player)
      .sort((a, b) => POSITION_ORDER.indexOf(a.posicao) - POSITION_ORDER.indexOf(b.posicao))
  }
  const text = JSON.stringify(pack, null, 2)
    .replace(/"cores": \[\s*("[^"]*"),\s*("[^"]*")\s*\]/g, '"cores": [$1, $2]')
    .replace(/\{\s*("nome": [^{}[\]]*?"nota": \d+)\s*\}/g, (_, body: string) => {
      return `{ ${body.replace(/,\s+/g, ', ')} }`
    })
  writeFileSync(PACK, `${text}\n`)
  console.log(`\n${PACK} atualizado`)
}
