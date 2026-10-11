import { Navigate, Route, Routes } from 'react-router'
import { useApplyTheme } from './store/theme.ts'
import { CUP_SLUG } from './ui/routes.ts'
import { FriendlyScreen } from './ui/screens/FriendlyScreen.tsx'
import { CalendarScreen } from './ui/screens/game/CalendarScreen.tsx'
import { ClubScreen } from './ui/screens/game/ClubScreen.tsx'
import { CompetitionsScreen, OwnDivision } from './ui/screens/game/CompetitionsScreen.tsx'
import { GameLayout } from './ui/screens/game/GameLayout.tsx'
import { MarketScreen } from './ui/screens/game/MarketScreen.tsx'
import { OverviewScreen } from './ui/screens/game/OverviewScreen.tsx'
import { TeamScreen } from './ui/screens/game/TeamScreen.tsx'
import { HomeScreen } from './ui/screens/HomeScreen.tsx'
import { LiveMatchScreen } from './ui/screens/LiveMatchScreen.tsx'
import { NewGameScreen } from './ui/screens/NewGameScreen.tsx'

/** Pages that were merged into others, kept so old bookmarks and the installed app still land. */
const MOVED: Record<string, string> = {
  elenco: '/jogo/time',
  escalacao: '/jogo/time',
  copa: `/jogo/competicoes/${CUP_SLUG}`,
  financas: '/jogo/clube/financas',
  carreira: '/jogo/clube/diretoria',
}

export default function App() {
  useApplyTheme()
  return (
    <Routes>
      <Route path="/" element={<HomeScreen />} />
      <Route path="/novo" element={<NewGameScreen />} />
      <Route path="/amistoso" element={<FriendlyScreen />} />
      <Route path="/jogo" element={<GameLayout />}>
        <Route index element={<OverviewScreen />} />
        <Route path="time" element={<TeamScreen />} />
        <Route path="mercado/:tab?" element={<MarketScreen />} />
        <Route path="competicoes/:competition?/:tab?" element={<CompetitionsScreen />} />
        <Route path="calendario" element={<CalendarScreen />} />
        <Route path="clube/:tab?" element={<ClubScreen />} />
        <Route path="tabela" element={<OwnDivision />} />
        <Route path="artilharia" element={<OwnDivision tab="artilharia" />} />
        {Object.entries(MOVED).map(([from, to]) => (
          <Route key={from} path={from} element={<Navigate to={to} replace />} />
        ))}
      </Route>
      <Route path="/jogo/partida" element={<LiveMatchScreen />} />
    </Routes>
  )
}
