declare const __APP_VERSION__: { commit: string; builtAt: string }

/** The build running, as the home screen shows it: the day it was built and its commit. */
export function versionText(): string {
  const { commit, builtAt } = __APP_VERSION__
  const day = new Date(builtAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  return `Versão de ${day} · ${commit}`
}
