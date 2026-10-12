import { Navigate, useNavigate, useParams } from 'react-router'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BoardPanel, HistoryPanel } from './BoardPanels.tsx'
import { EditorPanel } from './EditorPanel.tsx'
import { FinancePanel, StadiumPanel } from './FinancePanels.tsx'

const TABS = {
  diretoria: { label: 'Diretoria', panel: BoardPanel },
  financas: { label: 'Finanças', panel: FinancePanel },
  estadio: { label: 'Estádio', panel: StadiumPanel },
  historico: { label: 'Histórico', panel: HistoryPanel },
  editor: { label: 'Editor', panel: EditorPanel },
}

type Tab = keyof typeof TABS

/** The club and its board: goals and trust, money, the ground, the career so far and the names. */
export function ClubScreen() {
  const navigate = useNavigate()
  const { tab } = useParams()
  if (!tab || !(tab in TABS)) return <Navigate to="/jogo/clube/diretoria" replace />
  return (
    <Tabs value={tab} onValueChange={(value) => navigate(`/jogo/clube/${value}`)}>
      <TabsList>
        {Object.entries(TABS).map(([value, { label }]) => (
          <TabsTrigger key={value} value={value}>
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
      {(Object.keys(TABS) as Tab[]).map((value) => {
        const Panel = TABS[value].panel
        return (
          <TabsContent key={value} value={value}>
            <Panel />
          </TabsContent>
        )
      })}
    </Tabs>
  )
}
