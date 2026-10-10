import { Route, Routes } from 'react-router'
import { useApplyTheme } from './store/theme.ts'
import { FriendlyScreen } from './ui/screens/FriendlyScreen.tsx'
import { CalendarScreen } from './ui/screens/game/CalendarScreen.tsx'
import { GameLayout } from './ui/screens/game/GameLayout.tsx'
import { LineupScreen } from './ui/screens/game/LineupScreen.tsx'
import { OverviewScreen } from './ui/screens/game/OverviewScreen.tsx'
import { ScorersScreen } from './ui/screens/game/ScorersScreen.tsx'
import { SquadScreen } from './ui/screens/game/SquadScreen.tsx'
import { TableScreen } from './ui/screens/game/TableScreen.tsx'
import { HomeScreen } from './ui/screens/HomeScreen.tsx'
import { LiveMatchScreen } from './ui/screens/LiveMatchScreen.tsx'
import { NewGameScreen } from './ui/screens/NewGameScreen.tsx'

export default function App() {
  useApplyTheme()
  return (
    <Routes>
      <Route path="/" element={<HomeScreen />} />
      <Route path="/novo" element={<NewGameScreen />} />
      <Route path="/amistoso" element={<FriendlyScreen />} />
      <Route path="/jogo" element={<GameLayout />}>
        <Route index element={<OverviewScreen />} />
        <Route path="elenco" element={<SquadScreen />} />
        <Route path="escalacao" element={<LineupScreen />} />
        <Route path="tabela" element={<TableScreen />} />
        <Route path="calendario" element={<CalendarScreen />} />
        <Route path="artilharia" element={<ScorersScreen />} />
      </Route>
      <Route path="/jogo/partida" element={<LiveMatchScreen />} />
    </Routes>
  )
}
