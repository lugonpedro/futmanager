import {
  ArrowLeftRightIcon,
  CalendarDaysIcon,
  HouseIcon,
  ShirtIcon,
  TrophyIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react'

/** The pages of a room's menu once its league starts, by their part of the address. */
export type RoomPageSlug = '' | 'time' | 'mercado' | 'tabela' | 'rodadas' | 'sala'

export const ROOM_PAGES: { slug: RoomPageSlug; label: string; icon: LucideIcon }[] = [
  { slug: '', label: 'Resumo', icon: HouseIcon },
  { slug: 'time', label: 'Time', icon: ShirtIcon },
  { slug: 'mercado', label: 'Mercado', icon: ArrowLeftRightIcon },
  { slug: 'tabela', label: 'Tabela', icon: TrophyIcon },
  { slug: 'rodadas', label: 'Rodadas', icon: CalendarDaysIcon },
  { slug: 'sala', label: 'Sala', icon: UsersIcon },
]

/** The page an address names; the summary for none or one that doesn't exist. */
export const roomPageSlug = (page: string | undefined): RoomPageSlug =>
  ROOM_PAGES.find((p) => p.slug === (page ?? ''))?.slug ?? ''
