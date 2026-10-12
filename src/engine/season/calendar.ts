/**
 * Dates of the game. A day is a 'AAAA-MM-DD' string: plain JSON in the save,
 * and two dates compare in calendar order as strings. All the arithmetic is in
 * UTC from the year alone, so the calendar never depends on the clock or the
 * time zone of the device.
 */
export type GameDate = string

const DAY_MS = 86_400_000

const pad = (value: number, size = 2) => String(value).padStart(size, '0')

export const dateOf = (year: number, month: number, day: number): GameDate =>
  `${pad(year, 4)}-${pad(month)}-${pad(day)}`

export function dateParts(date: GameDate): { year: number; month: number; day: number } {
  const [year, month, day] = date.split('-').map(Number)
  return { year, month, day }
}

/** Days since 1970-01-01. */
export function toDays(date: GameDate): number {
  const { year, month, day } = dateParts(date)
  return Date.UTC(year, month - 1, day) / DAY_MS
}

export function fromDays(days: number): GameDate {
  const date = new Date(days * DAY_MS)
  return dateOf(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
}

export const addDays = (date: GameDate, days: number) => fromDays(toDays(date) + days)

export const daysBetween = (from: GameDate, to: GameDate) => toDays(to) - toDays(from)

/** 0 for Sunday to 6 for Saturday. */
export const weekday = (date: GameDate) => (((toDays(date) + 4) % 7) + 7) % 7

export const SATURDAY = 6
export const WEDNESDAY = 3

/** The first day on or after `date` that falls on the given weekday. */
export function nextWeekday(date: GameDate, day: number): GameDate {
  return addDays(date, (day - weekday(date) + 7) % 7)
}

export const daysInMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate()

/** Every day from `from` up to, but not including, `to`. */
export function daysFrom(from: GameDate, to: GameDate): GameDate[] {
  const days: GameDate[] = []
  for (let d = toDays(from); d < toDays(to); d++) days.push(fromDays(d))
  return days
}

export const WEEKDAY_NAMES = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
export const MONTH_NAMES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]

/** "18/04/2027". */
export function formatDate(date: GameDate): string {
  const { year, month, day } = dateParts(date)
  return `${pad(day)}/${pad(month)}/${year}`
}

/** "sáb, 18/04/2027". */
export const formatDayDate = (date: GameDate) =>
  `${WEEKDAY_NAMES[weekday(date)]}, ${formatDate(date)}`

/** "18/04". */
export function formatDayMonth(date: GameDate): string {
  const { month, day } = dateParts(date)
  return `${pad(day)}/${pad(month)}`
}

/** "sáb, 18/04". */
export const formatShortDate = (date: GameDate) =>
  `${WEEKDAY_NAMES[weekday(date)]}, ${formatDayMonth(date)}`

/* The season, shaped like the Brazilian one. */

/** The league kicks off on the first Saturday from this day of April. */
const LEAGUE_START = { month: 4, day: 8 }
/** And ends on the last Saturday up to this day of December. */
const LEAGUE_END = { month: 12, day: 6 }
/** FIFA dates: no league on the first Saturday of these months. */
const FIFA_MONTHS = [6, 9]

/** A transfer window, first and last day included. */
export type TransferWindow = { name: string; from: GameDate; to: GameDate }

export function transferWindows(year: number): TransferWindow[] {
  return [
    { name: 'Janela de pré-temporada', from: dateOf(year, 1, 1), to: dateOf(year, 1, 31) },
    { name: 'Janela do meio do ano', from: dateOf(year, 7, 1), to: dateOf(year, 7, 31) },
  ]
}

export const transferWindowAt = (date: GameDate) =>
  transferWindows(dateParts(date).year).find((w) => w.from <= date && date <= w.to)

export const inTransferWindow = (date: GameDate) => transferWindowAt(date) !== undefined

/** The window open on a day, or else the next one to open. */
export function currentOrNextWindow(date: GameDate): TransferWindow {
  const { year } = dateParts(date)
  return [...transferWindows(year), ...transferWindows(year + 1)].find((w) => date <= w.to)!
}

/** First day of a season: the pre-season starts with the year. */
export const seasonStart = (year: number) => dateOf(year, 1, 1)

/** Saturdays with no league football, saved for national teams. */
export const fifaDates = (year: number) =>
  FIFA_MONTHS.map((month) => nextWeekday(dateOf(year, month, 1), SATURDAY))

export type SeasonDates = {
  /** Date of each league round, the first at index 0. */
  league: GameDate[]
  /** Date of the cup stage played after each of `cupRounds`, in the same order. */
  cup: GameDate[]
}

/**
 * The days a season is played on. A league round each Saturday from April to
 * December, except on FIFA dates; the cup on the Wednesday after each of
 * `cupRounds`; and as many midweek league rounds as needed to fit them all,
 * spread through the year, never in a cup week.
 */
export function seasonDates(
  year: number,
  totalRounds: number,
  cupRounds: readonly number[],
): SeasonDates {
  const breaks = new Set(fifaDates(year))
  const end = dateOf(year, LEAGUE_END.month, LEAGUE_END.day)
  const saturdays: GameDate[] = []
  let saturday = nextWeekday(dateOf(year, LEAGUE_START.month, LEAGUE_START.day), SATURDAY)
  for (; saturday <= end; saturday = addDays(saturday, 7)) {
    if (!breaks.has(saturday)) saturdays.push(saturday)
  }
  const weeks = saturdays.length
  const midweek = Math.max(0, totalRounds - weeks)
  const league: GameDate[] = []
  const cup: GameDate[] = []
  let midweekPlayed = 0

  for (let week = 0; league.length < totalRounds; week++) {
    // Rounds a cup week or two pushed past December go on the next Saturdays.
    if (week >= saturdays.length) saturdays.push(addDays(saturdays[saturdays.length - 1], 7))
    league.push(saturdays[week])
    const wednesday = addDays(saturdays[week], 4)
    if (cupRounds.includes(league.length)) {
      cup.push(wednesday)
      continue
    }
    // Midweek rounds are due evenly, a week early so the season still ends on a Saturday.
    const due = Math.floor(((week + 2) * midweek) / weeks)
    const next = league.length + 1
    if (midweekPlayed < due && next <= totalRounds && !cupRounds.includes(next)) {
      league.push(wednesday)
      midweekPlayed++
    }
  }
  return { league, cup }
}
