import { useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { Fixture } from '../../../engine/model/types.ts'
import { CUP_NAME, cupScorers } from '../../../engine/season/cup.ts'
import { leagueScorers } from '../../../engine/season/season.ts'
import { useGame } from '../../../store/game.ts'
import { divisionName, formatDayDate } from '../../format.ts'
import { competitionsPath, CUP_SLUG, divisionSlug } from '../../routes.ts'
import { CupBracket, NoCup } from './CupBracket.tsx'
import { FixtureLine } from './FixtureLine.tsx'
import { ScorersTable } from './ScorersTable.tsx'
import { StandingsTable } from './StandingsTable.tsx'

const LEAGUE_TABS = { classificacao: 'Classificação', artilharia: 'Artilharia', jogos: 'Jogos' }
const CUP_TABS = { chave: 'Chave', artilharia: 'Artilharia', jogos: 'Jogos' }

/** Sends an old address, like the top scorers page, to that tab of the user's division. */
export function OwnDivision({ tab }: { tab?: string }) {
  return <Navigate to={competitionsPath(useGame(), tab)} replace />
}

/**
 * Every competition in one page: a picker for the divisions and the cup, then
 * tabs for the table (or the cup draw), the top scorers and the games. Both
 * choices live in the address, so links and the back button work.
 */
export function CompetitionsScreen() {
  const game = useGame()
  const navigate = useNavigate()
  const params = useParams()
  const { world } = game
  const competitions = [
    ...world.leagues.map((l) => ({
      slug: divisionSlug(l.division),
      label: divisionName(l.division),
      leagueId: l.id,
    })),
    { slug: CUP_SLUG, label: 'Copa', leagueId: undefined },
  ]
  const competition = competitions.find((c) => c.slug === params.competition)
  if (!competition) return <Navigate to={competitionsPath(game)} replace />
  const tabs: Record<string, string> = competition.leagueId ? LEAGUE_TABS : CUP_TABS
  if (!params.tab || !(params.tab in tabs)) {
    return <Navigate to={`/jogo/competicoes/${competition.slug}/${Object.keys(tabs)[0]}`} replace />
  }
  const tab = params.tab

  const go = (slug: string, nextTab: string) => navigate(`/jogo/competicoes/${slug}/${nextTab}`)
  const pickCompetition = (slug: string) => {
    const isCup = slug === CUP_SLUG
    // The first tab is the table in a league and the draw in the cup; the others match.
    const first = tab === 'classificacao' || tab === 'chave'
    go(slug, first ? (isCup ? 'chave' : 'classificacao') : tab)
  }

  return (
    <div className="flex flex-col gap-3">
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        aria-label="Competição"
        value={competition.slug}
        onValueChange={(value) => value && pickCompetition(value)}
      >
        {competitions.map((c) => (
          <ToggleGroupItem key={c.slug} value={c.slug} className="px-3">
            {c.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <Tabs value={tab} onValueChange={(value) => go(competition.slug, value)}>
        <TabsList>
          {Object.entries(tabs).map(([value, label]) => (
            <TabsTrigger key={value} value={value}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        {competition.leagueId ? (
          <>
            <TabsContent value="classificacao">
              <StandingsTable leagueId={competition.leagueId} />
            </TabsContent>
            <TabsContent value="artilharia">
              <ScorersTable scorers={leagueScorers(game, competition.leagueId)} />
            </TabsContent>
            <TabsContent value="jogos">
              <LeagueGames key={competition.leagueId} leagueId={competition.leagueId} />
            </TabsContent>
          </>
        ) : (
          <>
            <TabsContent value="chave">
              <CupBracket />
            </TabsContent>
            <TabsContent value="artilharia">
              {game.season.cup ? <ScorersTable scorers={cupScorers(game.season.cup)} /> : <NoCup />}
            </TabsContent>
            <TabsContent value="jogos">
              <CupGames />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  )
}

/** Every game of a league round, with who scored. */
function LeagueGames({ leagueId }: { leagueId: string }) {
  const game = useGame()
  const { season } = game
  const [search] = useSearchParams()
  const [round, setRound] = useState(() => {
    const asked = Number(search.get('rodada'))
    return asked >= 1 && asked <= season.totalRounds
      ? asked
      : Math.min(season.round, season.totalRounds)
  })
  const rounds = Array.from({ length: season.totalRounds }, (_, i) => String(i + 1))
  return (
    <GameList
      label="Rodada"
      options={rounds}
      value={String(round)}
      onChange={(value) => setRound(Number(value))}
      fixtures={season.fixtures[leagueId][round - 1]}
      caption={`${formatDayDate(season.fixtures[leagueId][round - 1][0].date)}${round === season.round ? ', próxima rodada' : ''}`}
    />
  )
}

/** Every tie of a cup stage, with who scored. */
function CupGames() {
  const game = useGame()
  const { cup } = game.season
  const [search] = useSearchParams()
  // Opens on the stage asked for, or else the one being played: the first with a tie to play.
  const [stage, setStage] = useState(() => {
    const stages = cup?.stages ?? []
    const asked = search.get('fase')
    if (asked && stages.some((s) => s.name === asked)) return asked
    const open = stages.findIndex((s) => s.ties.length === 0 || s.ties.some((t) => !t.result))
    return stages[open === -1 ? stages.length - 1 : open]?.name ?? ''
  })
  if (!cup) return <NoCup />
  const current = cup.stages.find((s) => s.name === stage) ?? cup.stages[0]
  return (
    <GameList
      label="Fase"
      options={cup.stages.map((s) => s.name)}
      value={current.name}
      onChange={setStage}
      fixtures={current.ties}
      caption={`${CUP_NAME}, ${formatDayDate(current.date)}`}
      empty="Sorteio ao fim da fase anterior."
    />
  )
}

function GameList(props: {
  label: string
  options: string[]
  value: string
  onChange: (value: string) => void
  fixtures: readonly Fixture[]
  caption?: string
  empty?: string
}) {
  const { world, userClubId } = useGame()
  return (
    <Card className="max-w-3xl gap-3 px-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {props.label}
        <Select value={props.value} onValueChange={props.onChange}>
          <SelectTrigger size="sm" aria-label={props.label}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {props.options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {props.caption && <span className="text-muted-foreground">{props.caption}</span>}
      </div>
      {props.fixtures.length === 0 ? (
        <p className="text-sm text-muted-foreground">{props.empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {props.fixtures.map((fixture) => (
            <li key={fixture.id} className="flex flex-col gap-0.5">
              <FixtureLine fixture={fixture} world={world} userClubId={userClubId} />
              <Scorers fixture={fixture} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/** Who scored for each side, under the score line. */
function Scorers({ fixture }: { fixture: Fixture }) {
  const { world } = useGame()
  const goals = fixture.result?.goals ?? []
  if (goals.length === 0) return null
  const side = (clubId: string) =>
    goals
      .filter((g) => g.clubId === clubId)
      .map((g) => `${world.players[g.playerId].name.split(' ').slice(-1)[0]} ${g.minute}'`)
      .join(', ')
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-2 text-xs text-muted-foreground">
      <span className="text-right">{side(fixture.homeId)}</span>
      <span className="invisible px-2 font-semibold">0 x 0</span>
      <span>{side(fixture.awayId)}</span>
    </div>
  )
}
