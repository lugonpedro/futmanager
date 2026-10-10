import type { Rng } from '../rng.ts'

const FIRST_NAMES = [
  'Adriano',
  'Alex',
  'Anderson',
  'André',
  'Bruno',
  'Caio',
  'Carlos',
  'César',
  'Cláudio',
  'Daniel',
  'Danilo',
  'Diego',
  'Douglas',
  'Edson',
  'Eduardo',
  'Elias',
  'Emerson',
  'Fábio',
  'Felipe',
  'Fernando',
  'Flávio',
  'Gabriel',
  'Gilberto',
  'Guilherme',
  'Gustavo',
  'Hélio',
  'Henrique',
  'Hugo',
  'Igor',
  'Jefferson',
  'João',
  'Jorge',
  'José',
  'Júlio',
  'Leandro',
  'Leonardo',
  'Lucas',
  'Luciano',
  'Luís',
  'Marcelo',
  'Marcos',
  'Mateus',
  'Maurício',
  'Murilo',
  'Nathan',
  'Otávio',
  'Paulo',
  'Pedro',
  'Rafael',
  'Renan',
  'Renato',
  'Ricardo',
  'Roberto',
  'Rodrigo',
  'Rogério',
  'Samuel',
  'Sérgio',
  'Thiago',
  'Vinícius',
  'Wagner',
  'Wellington',
  'William',
]

const SURNAMES = [
  'Almeida',
  'Alves',
  'Andrade',
  'Araújo',
  'Barbosa',
  'Barros',
  'Batista',
  'Borges',
  'Cardoso',
  'Carvalho',
  'Castro',
  'Costa',
  'Cunha',
  'Dias',
  'Duarte',
  'Farias',
  'Fernandes',
  'Ferreira',
  'Freitas',
  'Gomes',
  'Gonçalves',
  'Lima',
  'Lopes',
  'Machado',
  'Martins',
  'Melo',
  'Mendes',
  'Miranda',
  'Monteiro',
  'Moraes',
  'Moreira',
  'Nascimento',
  'Neves',
  'Nogueira',
  'Nunes',
  'Oliveira',
  'Pereira',
  'Pinto',
  'Prado',
  'Queiroz',
  'Ramos',
  'Reis',
  'Ribeiro',
  'Rocha',
  'Rodrigues',
  'Santana',
  'Santos',
  'Siqueira',
  'Silva',
  'Soares',
  'Souza',
  'Teixeira',
  'Tavares',
  'Vieira',
]

/** Single-name nicknames, a staple of Brazilian football. */
const NICKNAMES = [
  'Bebeto',
  'Biro',
  'Cacau',
  'Didi',
  'Dudu',
  'Fumaça',
  'Gaúcho',
  'Juninho',
  'Kaká',
  'Léo',
  'Magrão',
  'Mineiro',
  'Careca',
  'Baiano',
  'Pipoca',
  'Russo',
  'Tinga',
  'Tico',
  'Zé Carlos',
  'Zezinho',
]

const CITY_STARTS = [
  'Rio',
  'Serra',
  'Vila',
  'Porto',
  'Campo',
  'Lagoa',
  'Monte',
  'Vale',
  'Morro',
  'Barra',
]

// Endings that read naturally after any start, so names stay grammatical.
const CITY_ENDS = [
  'Azul',
  'Verde',
  'Grande',
  'das Pedras',
  'do Sul',
  'da Mata',
  'do Norte',
  'do Leste',
  'dos Ventos',
  'das Flores',
  'das Águas',
]

const CLUB_PATTERNS: readonly ((city: string) => string)[] = [
  (city) => `Esporte Clube ${city}`,
  (city) => `Atlético ${city}`,
  (city) => `${city} Futebol Clube`,
  (city) => `União ${city}`,
  (city) => `Sport ${city}`,
  (city) => `Operário de ${city}`,
  (city) => `Independente de ${city}`,
  (city) => `Associação ${city}`,
  (city) => `Ferroviário de ${city}`,
  (city) => `Real ${city}`,
]

export const CLUB_COLORS: readonly { primary: string; secondary: string }[] = [
  { primary: '#c8102e', secondary: '#ffffff' },
  { primary: '#000000', secondary: '#ffffff' },
  { primary: '#006b3f', secondary: '#ffffff' },
  { primary: '#003da5', secondary: '#ffffff' },
  { primary: '#c8102e', secondary: '#000000' },
  { primary: '#ffd100', secondary: '#006b3f' },
  { primary: '#003da5', secondary: '#c8102e' },
  { primary: '#5b2c83', secondary: '#ffffff' },
  { primary: '#ff7f00', secondary: '#000000' },
  { primary: '#7a1f2b', secondary: '#ffffff' },
  { primary: '#00a3e0', secondary: '#ffffff' },
  { primary: '#006b3f', secondary: '#c8102e' },
]

export function playerName(rng: Rng): string {
  if (rng.next() < 0.15) return rng.pick(NICKNAMES)
  return `${rng.pick(FIRST_NAMES)} ${rng.pick(SURNAMES)}`
}

/** Every possible city name, so callers can draw them without repeats. */
export function allCityNames(): string[] {
  return CITY_STARTS.flatMap((start) => CITY_ENDS.map((end) => `${start} ${end}`))
}

export function clubName(rng: Rng, city: string): string {
  return rng.pick(CLUB_PATTERNS)(city)
}

const stripAccents = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

/**
 * Three-letter abbreviations for a city, best first: "Rio do Sul" → "RIS", then
 * "RSU", "RSL"... Callers take the first one no other club uses yet.
 */
export function shortNameCandidates(city: string): string[] {
  const words = stripAccents(city)
    .toUpperCase()
    .split(' ')
    .filter((word) => !['DA', 'DAS', 'DO', 'DOS', 'DE'].includes(word))
  const first = words[0]
  const last = words[words.length - 1]
  const candidates = [`${first.slice(0, 2)}${last[0]}`]
  for (const letter of last.slice(1)) candidates.push(`${first[0]}${last[0]}${letter}`)
  for (const letter of first.slice(2)) candidates.push(`${first.slice(0, 2)}${letter}`)
  return [...new Set(candidates)]
}
