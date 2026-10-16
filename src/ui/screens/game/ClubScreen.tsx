import { useEffect } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BoardPanel, HistoryPanel } from './BoardPanels.tsx'
import { EditorPanel } from './EditorPanel.tsx'
import { FinancePanel, StadiumPanel } from './FinancePanels.tsx'
import { LearnLink } from '../../components/LearnLink.tsx'
import type { CareerSection } from '../../learn.ts'
import { SponsorPanel } from './SponsorPanel.tsx'

/** The parts of the club overview, in page order; their old tab addresses open the page there. */
const SECTIONS = {
  diretoria: { label: 'Diretoria', panel: BoardPanel, learn: 'diretoria' },
  patrocinio: { label: 'Patrocínio', panel: SponsorPanel, learn: 'financas' },
  estadio: { label: 'Estádio', panel: StadiumPanel, learn: 'financas' },
} satisfies Record<string, { label: string; panel: unknown; learn: CareerSection }>

type Section = keyof typeof SECTIONS

const OVERVIEW = 'visao'

const TABS = {
  [OVERVIEW]: { label: 'Visão do clube', panel: ClubOverview },
  financas: { label: 'Finanças', panel: FinanceTab },
  historico: { label: 'Histórico', panel: HistoryPanel },
  editor: { label: 'Editor', panel: EditorPanel },
}

type Tab = keyof typeof TABS

const isSection = (tab: string): tab is Section => tab in SECTIONS

/** The club and its board: goals, sponsors and the ground on one page, then the money, the career so far and the names. */
export function ClubScreen() {
  const navigate = useNavigate()
  const { tab = OVERVIEW } = useParams()
  const section = isSection(tab) ? tab : undefined
  const value = section ? OVERVIEW : tab

  useEffect(() => {
    if (section) document.getElementById(section)?.scrollIntoView({ block: 'start' })
  }, [section])

  if (!(value in TABS)) return <Navigate to="/jogo/clube" replace />
  return (
    <Tabs
      value={value}
      onValueChange={(next) => navigate(next === OVERVIEW ? '/jogo/clube' : `/jogo/clube/${next}`)}
    >
      <TabsList>
        {Object.entries(TABS).map(([key, { label }]) => (
          <TabsTrigger key={key} value={key}>
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
      {(Object.keys(TABS) as Tab[]).map((key) => {
        const Panel = TABS[key].panel
        return (
          <TabsContent key={key} value={key}>
            <Panel />
          </TabsContent>
        )
      })}
    </Tabs>
  )
}

/** The board, the sponsors and the ground, one after the other. */
function ClubOverview() {
  return (
    <div className="flex flex-col gap-8">
      {(Object.keys(SECTIONS) as Section[]).map((key) => {
        const { label, panel: Panel, learn } = SECTIONS[key]
        return (
          <section key={key} id={key} aria-labelledby={`${key}-title`} className="scroll-mt-16">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 id={`${key}-title`} className="text-lg font-semibold">
                {label}
              </h2>
              <LearnLink tab="carreira" section={learn} />
            </div>
            <Panel />
          </section>
        )
      })}
    </div>
  )
}

/** The accounts, on a tab of their own: they run long with the ledger. */
function FinanceTab() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Finanças</h2>
        <LearnLink tab="carreira" section="financas" />
      </div>
      <FinancePanel />
    </div>
  )
}
