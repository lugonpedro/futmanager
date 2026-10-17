import type { Position } from '../model/types.ts'
import {
  cleanShortName,
  PACK_LIMITS,
  type DataPack,
  type PackClub,
  type PackPlayer,
} from './pack.ts'

/**
 * Pack files, as the player reads and writes them: JSON with Portuguese keys,
 * or a spreadsheet saved as CSV, which is how most people will put one
 * together. Messages are for the player, so they are in Portuguese.
 */
export const PACK_FORMAT = 'futmanager-pacote'
export const PACK_FILE_VERSION = 1

export type ParsedPack = { pack: DataPack; warnings: string[] }

const stripAccents = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Words people use for each position, plain or as the usual abbreviations. */
const POSITION_ALIASES: Record<string, Position> = {
  G: 'G',
  GOL: 'G',
  GOLEIRO: 'G',
  GK: 'G',
  Z: 'Z',
  ZAG: 'Z',
  ZAGUEIRO: 'Z',
  CB: 'Z',
  L: 'L',
  LAT: 'L',
  LATERAL: 'L',
  LD: 'L',
  LE: 'L',
  M: 'M',
  MEI: 'M',
  MEIA: 'M',
  MC: 'M',
  VOL: 'M',
  VOLANTE: 'M',
  A: 'A',
  ATA: 'A',
  ATACANTE: 'A',
  CA: 'A',
  PE: 'A',
  PD: 'A',
  PTA: 'A',
}

/** Anything image-like: packs never carry crests. */
const IMAGE_KEYS = ['escudo', 'imagem', 'logo', 'foto', 'crest', 'image']
const NO_IMAGES =
  'Escudos e imagens não são aceitos; o jogo desenha um escudo genérico com as cores e a sigla.'

class Reader {
  warnings: string[] = []
  warn(where: string, message: string) {
    this.warnings.push(where ? `${where}: ${message}` : message)
  }

  text(value: unknown, max = PACK_LIMITS.name): string | undefined {
    if (value === undefined || value === null) return undefined
    const text = String(value)
      // oxlint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    return text ? text.slice(0, max) : undefined
  }

  shortName(value: unknown, where: string): string | undefined {
    const raw = this.text(value)
    if (!raw) return undefined
    const code = stripAccents(raw)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
    if (code.length < 2 || code !== cleanShortName(code)) {
      this.warn(where, `a sigla "${raw}" precisa ter de 2 a 4 letras ou números; ficou a gerada.`)
      return undefined
    }
    return code
  }

  color(value: unknown, where: string): string | undefined {
    const raw = this.text(value)
    if (!raw) return undefined
    const hex = raw.startsWith('#') ? raw.slice(1) : raw
    if (/^[0-9a-f]{3}$/i.test(hex)) return `#${[...hex].map((c) => c + c).join('')}`.toLowerCase()
    if (/^[0-9a-f]{6}$/i.test(hex)) return `#${hex}`.toLowerCase()
    this.warn(where, `a cor "${raw}" não é uma cor como #c8102e; ficaram as geradas.`)
    return undefined
  }

  position(value: unknown, where: string): Position | undefined {
    const raw = this.text(value)
    if (!raw) return undefined
    const position = POSITION_ALIASES[stripAccents(raw).toUpperCase()]
    if (!position) this.warn(where, `a posição "${raw}" não existe; use G, Z, L, M ou A.`)
    return position
  }

  number(
    value: unknown,
    limits: { min: number; max: number },
    label: string,
    where: string,
  ): number | undefined {
    const raw = this.text(value)
    if (!raw) return undefined
    const number = Number(raw.replace(',', '.'))
    if (!Number.isFinite(number) || number < limits.min || number > limits.max) {
      this.warn(where, `${label} "${raw}" precisa ficar entre ${limits.min} e ${limits.max}.`)
      return undefined
    }
    return Math.round(number)
  }

  colors(primary: unknown, secondary: unknown, where: string): PackClub['colors'] {
    const first = this.color(primary, where)
    const second = this.color(secondary, where)
    if (!first && !second) return undefined
    if (!first || !second) {
      // A colour that was there but unreadable has been reported already.
      if (!this.text(primary) || !this.text(secondary)) {
        this.warn(where, 'informe as duas cores do clube; ficaram as geradas.')
      }
      return undefined
    }
    return { primary: first, secondary: second }
  }

  player(fields: Record<string, unknown>, where: string): PackPlayer {
    return compact({
      name: this.text(fields.name),
      position: this.position(fields.position, where),
      age: this.number(fields.age, PACK_LIMITS.age, 'a idade', where),
      overall: this.number(fields.overall, PACK_LIMITS.overall, 'o overall', where),
    })
  }
}

const compact = <T extends object>(fields: T): T =>
  Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as T

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasImage = (record: Record<string, unknown>) =>
  Object.keys(record).some((key) => IMAGE_KEYS.includes(stripAccents(key).toLowerCase()))

function readJson(text: string): ParsedPack {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('O arquivo não é um JSON válido.')
  }
  if (!isRecord(data) || data.formato !== PACK_FORMAT || !Array.isArray(data.clubes)) {
    throw new Error('O arquivo não é um pacote de dados do onzemestre.')
  }
  if (typeof data.versao === 'number' && data.versao > PACK_FILE_VERSION) {
    throw new Error('Este pacote é de uma versão mais nova do jogo. Atualize a página.')
  }
  const reader = new Reader()
  let images = false
  const clubs = data.clubes.map((raw, index): PackClub => {
    if (!isRecord(raw)) return {}
    images ||= hasImage(raw)
    const where = reader.text(raw.nome) ?? `Clube ${index + 1}`
    const colors = Array.isArray(raw.cores) ? raw.cores : []
    const players = Array.isArray(raw.jogadores) ? raw.jogadores : undefined
    return compact({
      name: reader.text(raw.nome),
      shortName: reader.shortName(raw.sigla, where),
      city: reader.text(raw.cidade),
      colors: reader.colors(colors[0], colors[1], where),
      players: players?.map((p, i) => {
        if (!isRecord(p)) return {}
        images ||= hasImage(p)
        return reader.player(
          { name: p.nome, position: p.posicao, age: p.idade, overall: p.overall },
          `${where}, jogador ${i + 1}`,
        )
      }),
    })
  })
  if (images) reader.warn('', NO_IMAGES)
  return { pack: { name: reader.text(data.nome) ?? '', clubs }, warnings: reader.warnings }
}

/** Splits CSV text into rows of cells, with quoted cells and either separator. */
export function parseCsv(text: string): string[][] {
  const body = text.replace(/^﻿/, '')
  const header = body.slice(0, body.search(/\r?\n|$/))
  const separator =
    (header.match(/;/g)?.length ?? 0) > (header.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < body.length; i++) {
    const char = body[i]
    if (quoted) {
      if (char === '"' && body[i + 1] === '"') {
        cell += '"'
        i++
      } else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"') quoted = true
    else if (char === separator) {
      row.push(cell)
      cell = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && body[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += char
  }
  if (cell || row.length > 0) rows.push([...row, cell])
  return rows.filter((r) => r.some((c) => c.trim()))
}

const CSV_COLUMNS = {
  slot: ['ordem', 'n', 'numero'],
  club: ['clube', 'time', 'nomeclube'],
  shortName: ['sigla'],
  city: ['cidade'],
  primary: ['cor1', 'corprincipal', 'cor'],
  secondary: ['cor2', 'corsecundaria'],
  player: ['jogador', 'nome', 'nomejogador', 'atleta'],
  position: ['posicao', 'pos'],
  age: ['idade'],
  overall: ['overall', 'ovr', 'forca', 'geral'],
} as const

type CsvColumn = keyof typeof CSV_COLUMNS

const headerKey = (cell: string) =>
  stripAccents(cell)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

/**
 * One row per player. A row's club fields start a new club; a row without
 * them continues the club above. The "ordem" column, when there is one, says
 * which slot (1 to 40) the club goes to; otherwise clubs go in the order they
 * first appear.
 */
function readCsv(text: string, fileName: string): ParsedPack {
  const [header, ...rows] = parseCsv(text)
  if (!header) throw new Error('A planilha está vazia.')
  const keys = header.map(headerKey)
  const column = Object.fromEntries(
    (Object.keys(CSV_COLUMNS) as CsvColumn[]).map((name) => [
      name,
      keys.findIndex((key) => (CSV_COLUMNS[name] as readonly string[]).includes(key)),
    ]),
  ) as Record<CsvColumn, number>
  if (column.club < 0 && column.player < 0) {
    throw new Error(
      'A planilha precisa de uma linha de cabeçalho com as colunas "clube" e "jogador".',
    )
  }
  const reader = new Reader()
  const clubs: PackClub[] = []
  const byName = new Map<string, number>()
  let current = -1
  rows.forEach((cells, index) => {
    const cell = (name: CsvColumn) => (column[name] >= 0 ? cells[column[name]] : undefined)
    const where = `Linha ${index + 2}`
    const clubName = reader.text(cell('club'))
    const slot = reader.number(cell('slot'), { min: 1, max: 99 }, 'a ordem', where)
    const startsClub =
      slot !== undefined ||
      clubName !== undefined ||
      [cell('shortName'), cell('city'), cell('primary')].some((v) => reader.text(v))
    if (startsClub) {
      const known = clubName !== undefined ? byName.get(clubName.toLowerCase()) : undefined
      current = slot !== undefined ? slot - 1 : (known ?? Math.max(clubs.length, current + 1))
      const club = clubs[current] ?? {}
      clubs[current] = compact({
        ...club,
        name: clubName ?? club.name,
        shortName: reader.shortName(cell('shortName'), where) ?? club.shortName,
        city: reader.text(cell('city')) ?? club.city,
        colors: reader.colors(cell('primary'), cell('secondary'), where) ?? club.colors,
      })
      if (clubName) byName.set(clubName.toLowerCase(), current)
    }
    const player = reader.player(
      {
        name: cell('player'),
        position: cell('position'),
        age: cell('age'),
        overall: cell('overall'),
      },
      where,
    )
    if (Object.keys(player).length === 0) return
    if (current < 0) {
      reader.warn(where, 'jogador sem clube; informe o clube na primeira linha.')
      return
    }
    clubs[current].players = [...(clubs[current].players ?? []), player]
  })
  // An image column is never read, only reported.
  if (IMAGE_KEYS.some((key) => keys.includes(key))) reader.warn('', NO_IMAGES)
  const name = fileName.replace(/\.[^.]+$/, '').trim()
  return { pack: { name, clubs: Array.from(clubs, (c) => c ?? {}) }, warnings: reader.warnings }
}

/** Reads a pack from a .json or .csv file; throws with a message for the player when it can't. */
export function parsePackFile(text: string, fileName: string): ParsedPack {
  const json = /\.json$/i.test(fileName) || text.trimStart().startsWith('{')
  const parsed = json ? readJson(text) : readCsv(text, fileName)
  if (parsed.pack.clubs.length === 0) throw new Error('O pacote não tem nenhum clube.')
  return parsed
}

/**
 * Drops the players at the end of each position with nothing to say, keeping
 * the empty ones before a filled one so later players keep their places.
 */
function trimPlayers(players: readonly PackPlayer[]): PackPlayer[] {
  const filled = (p: PackPlayer) =>
    p.name !== undefined || p.age !== undefined || p.overall !== undefined
  return players.filter((player, index) => {
    if (filled(player)) return true
    return players
      .slice(index + 1)
      .some((later) => later.position === player.position && filled(later))
  })
}

export function packToJson(pack: DataPack): string {
  const clubs = pack.clubs.map((club) => {
    const players = trimPlayers(club.players ?? [])
    return compact({
      nome: club.name,
      sigla: club.shortName,
      cidade: club.city,
      cores: club.colors && [club.colors.primary, club.colors.secondary],
      jogadores:
        players.length > 0
          ? players.map((p) =>
              compact({ nome: p.name, posicao: p.position, idade: p.age, overall: p.overall }),
            )
          : undefined,
    })
  })
  return JSON.stringify(
    { formato: PACK_FORMAT, versao: PACK_FILE_VERSION, nome: pack.name, clubes: clubs },
    null,
    2,
  )
}

const csvCell = (value: string | number | undefined) => {
  const text = value === undefined ? '' : String(value)
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export const CSV_HEADER = [
  'ordem',
  'clube',
  'sigla',
  'cidade',
  'cor1',
  'cor2',
  'jogador',
  'posicao',
  'idade',
  'overall',
]

/** The pack as a spreadsheet, separated by ";" so Excel in Portuguese opens it in columns. */
export function packToCsv(pack: DataPack): string {
  const lines = [CSV_HEADER.join(';')]
  pack.clubs.forEach((club, index) => {
    const clubCells = [
      index + 1,
      club.name,
      club.shortName,
      club.city,
      club.colors?.primary,
      club.colors?.secondary,
    ]
    const players = trimPlayers(club.players ?? [])
    if (players.length === 0) {
      if (clubCells.slice(1).some((v) => v !== undefined)) {
        lines.push([...clubCells, '', '', '', ''].map(csvCell).join(';'))
      }
      return
    }
    players.forEach((p, i) => {
      const lead = i === 0 ? clubCells : clubCells.map(() => undefined)
      lines.push([...lead, p.name, p.position, p.age, p.overall].map(csvCell).join(';'))
    })
  })
  // The byte order mark tells Excel the file is UTF-8, so accents come out right.
  return `﻿${lines.join('\r\n')}\r\n`
}

/** File name for an exported pack, like pacote-brasileirao-2027.json. */
export function packFileName(pack: DataPack, extension: 'json' | 'csv'): string {
  const slug = stripAccents(pack.name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `pacote-${slug || 'onzemestre'}.${extension}`
}
