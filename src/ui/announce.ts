import { toast } from 'sonner'
import type { GameState } from '../engine/model/types.ts'
import { foldNews, newsBetween, type News } from './news.ts'

type Navigate = (to: string) => void

/** Long enough to read a line about money or a player before it goes. */
const DURATION = 7000

function show(item: News, navigate: Navigate) {
  const show = item.tone === 'info' ? toast.info : toast[item.tone]
  show(item.text, {
    duration: DURATION,
    action: item.link && { label: item.link.label, onClick: () => navigate(item.link!.to) },
  })
}

/** Toasts the news, folding anything past the first few into one "N novidades". */
export function announce(news: readonly News[], navigate: Navigate) {
  const { shown, folded } = foldNews(news)
  shown.forEach((item) => show(item, navigate))
  if (folded.length === 0) return
  toast.info(`${folded.length} novidades`, {
    duration: DURATION,
    description: folded.map((item) => item.text).join(' '),
    action: { label: 'Visão geral', onClick: () => navigate('/jogo') },
  })
}

/** Toasts what changed between two moments of the career. */
export const announceChanges = (before: GameState, after: GameState, navigate: Navigate) =>
  announce(newsBetween(before, after), navigate)
