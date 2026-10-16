import { toast } from 'sonner'
import type { GameState } from '../engine/model/types.ts'
import { foldNews, newsBetween, type News } from './news.ts'

type Navigate = (to: string) => void

/** Long enough to read a line about money or a player before it goes. */
const DURATION = 7000

/** The toasts of the last announcement, cleared when the next one comes in. */
let shown: (string | number)[] = []

function show(item: News, navigate: Navigate) {
  const show = item.tone === 'info' ? toast.info : toast[item.tone]
  return show(item.text, {
    duration: DURATION,
    action: item.link && { label: item.link.label, onClick: () => navigate(item.link!.to) },
  })
}

/** Toasts the news in place of the last batch, folding anything past the first few into one "N novidades". */
export function announce(news: readonly News[], navigate: Navigate) {
  if (news.length === 0) return
  // The previous day's news is old by now: the new batch replaces it rather than piling up.
  shown.forEach((id) => toast.dismiss(id))
  const { shown: first, folded } = foldNews(news)
  shown = first.map((item) => show(item, navigate))
  if (folded.length === 0) return
  shown.push(
    toast.info(`${folded.length} novidades`, {
      duration: DURATION,
      description: folded.map((item) => item.text).join(' '),
      action: { label: 'Visão geral', onClick: () => navigate('/jogo') },
    }),
  )
}

/** Toasts what changed between two moments of the career. */
export const announceChanges = (before: GameState, after: GameState, navigate: Navigate) =>
  announce(newsBetween(before, after), navigate)
