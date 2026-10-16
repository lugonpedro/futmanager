import { Navigate, Route, Routes } from 'react-router'
import { Toaster } from '@/components/ui/sonner'
import { useApplyTheme } from './store/theme.ts'
import { ConfirmHost } from './ui/components/ConfirmHost.tsx'
import { CUP_SLUG } from './ui/routes.ts'
import { AccountScreen } from './ui/screens/AccountScreen.tsx'
import { CloudScreen } from './ui/screens/CloudScreen.tsx'
import { EditorScreen } from './ui/screens/EditorScreen.tsx'
import { FantasyScreen } from './ui/screens/FantasyScreen.tsx'
import { FantasyInviteScreen } from './ui/screens/FantasyInviteScreen.tsx'
import { FantasyLeagueScreen } from './ui/screens/FantasyLeagueScreen.tsx'
import { FantasyPassScreen } from './ui/screens/FantasyPassScreen.tsx'
import { FantasyRoundScreen } from './ui/screens/FantasyRoundScreen.tsx'
import { CalendarScreen } from './ui/screens/game/CalendarScreen.tsx'
import { ClubScreen } from './ui/screens/game/ClubScreen.tsx'
import { CompetitionsScreen, OwnDivision } from './ui/screens/game/CompetitionsScreen.tsx'
import { GameLayout } from './ui/screens/game/GameLayout.tsx'
import { MarketScreen } from './ui/screens/game/MarketScreen.tsx'
import { OverviewScreen } from './ui/screens/game/OverviewScreen.tsx'
import { TeamScreen } from './ui/screens/game/TeamScreen.tsx'
import { HomeScreen } from './ui/screens/HomeScreen.tsx'
import { LearnScreen } from './ui/screens/LearnScreen.tsx'
import { LegalScreen } from './ui/screens/LegalScreen.tsx'
import { LiveMatchScreen } from './ui/screens/LiveMatchScreen.tsx'
import { NewGameScreen } from './ui/screens/NewGameScreen.tsx'
import { PrivacyScreen } from './ui/screens/PrivacyScreen.tsx'

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
    <>
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/novo" element={<NewGameScreen />} />
        <Route path="/amistoso" element={<Navigate to="/" replace />} />
        <Route path="/editor" element={<EditorScreen />} />
        <Route path="/aviso-legal" element={<LegalScreen />} />
        <Route path="/privacidade" element={<PrivacyScreen />} />
        <Route path="/conta" element={<AccountScreen />} />
        <Route path="/nuvem" element={<CloudScreen />} />
        <Route path="/fantasia" element={<FantasyScreen />} />
        <Route path="/fantasia/rodada/:round" element={<FantasyRoundScreen />} />
        <Route path="/fantasia/liga/:id" element={<FantasyLeagueScreen />} />
        <Route path="/fantasia/convite/:code" element={<FantasyInviteScreen />} />
        <Route path="/fantasia/passe" element={<FantasyPassScreen />} />
        <Route path="/aprenda/:tab?" element={<LearnScreen />} />
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
      <Toaster position="top-center" closeButton expand />
      <ConfirmHost />
    </>
  )
}
