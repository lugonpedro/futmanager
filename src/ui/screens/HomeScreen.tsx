export function HomeScreen() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-green-900 p-4 text-white">
      <h1 className="text-4xl font-bold">futmanager</h1>
      <p className="text-green-100">Gerencie seu time rumo à primeira divisão.</p>
      <button
        type="button"
        disabled
        className="rounded bg-yellow-400 px-6 py-3 font-semibold text-green-950 disabled:opacity-60"
      >
        Novo jogo (em breve)
      </button>
    </main>
  )
}
