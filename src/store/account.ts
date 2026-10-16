import type { User } from '@supabase/supabase-js'
import { toast } from 'sonner'
import { create } from 'zustand'
import { supabase } from '../cloud/client.ts'
import {
  FREE_CLOUD_SLOTS,
  moveToCloud,
  pushSlot,
  resolveConflict,
  syncAll,
  type RemoteSave,
  type SyncConflict,
} from '../cloud/sync.ts'
import { db } from '../db/saves.ts'
import { autosaveListeners, useGameStore } from './game.ts'

export type Profile = { nickname: string; crest: number }

type SyncStatus = 'idle' | 'syncing' | 'error'

type AccountStore = {
  /** Whether the saved session has been checked at start-up. */
  ready: boolean
  user?: { id: string; email?: string }
  profile?: Profile
  /** Whether the profile shown is only the default, not yet saved. */
  profileIsDefault: boolean
  status: SyncStatus
  lastSyncAt?: number
  /** Messages from the last sync, or the error that stopped it. */
  notes: string[]
  conflicts: SyncConflict[]
  /** How many careers the account keeps in the cloud. */
  cloudSlots: number
  /** The careers in the account, as of the last sync. */
  cloud: RemoteSave[]
}

export const useAccountStore = create<AccountStore>()(() => ({
  ready: false,
  profileIsDefault: true,
  status: 'idle',
  notes: [],
  conflicts: [],
  cloudSlots: FREE_CLOUD_SLOTS,
  cloud: [],
}))

const set = useAccountStore.setState
const get = useAccountStore.getState

function client() {
  if (!supabase) throw new Error('Contas não estão disponíveis nesta versão do jogo.')
  return supabase
}

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error)

/** The nickname suggested before the player picks one: the start of the e-mail. */
export function defaultNickname(email = '') {
  return (email.split('@')[0] || 'Técnico').slice(0, 24)
}

async function loadProfile(user: User) {
  const { data } = await client()
    .from('profiles')
    .select('nickname, crest')
    .eq('user_id', user.id)
    .maybeSingle()
  set(
    data
      ? { profile: data as Profile, profileIsDefault: false }
      : { profile: { nickname: defaultNickname(user.email), crest: 0 }, profileIsDefault: true },
  )
}

/** Reloads the running career if a sync replaced its slot, so play goes on from the newer one. */
async function refreshOpenGame(slots: string[]) {
  const { slotId, openSave, closeGame } = useGameStore.getState()
  if (!slotId) return
  if (slots.includes(slotId)) await openSave(slotId)
  else if (!(await db.saves.get(slotId))) closeGame()
}

let syncing: Promise<void> | undefined
/** Whether the last sync failed, so an outage is announced once. */
let failing = false

/** Syncs every career with the account; does nothing when signed out. */
export function syncNow(): Promise<void> {
  const user = get().user
  if (!supabase || !user) return Promise.resolve()
  if (syncing) return syncing
  set({ status: 'syncing' })
  syncing = (async () => {
    try {
      await flushPushes()
      const report = await syncAll(client(), user.id)
      await refreshOpenGame(report.downloaded)
      failing = false
      if (report.downloaded.length > 0) {
        toast.info(
          report.downloaded.length === 1
            ? 'Uma carreira veio atualizada da nuvem.'
            : `${report.downloaded.length} carreiras vieram atualizadas da nuvem.`,
        )
      }
      set({
        status: 'idle',
        lastSyncAt: Date.now(),
        notes: report.notes,
        conflicts: report.conflicts,
        cloudSlots: report.cloudSlots,
        cloud: report.cloud,
      })
    } catch (error) {
      // Once per outage: the next tries stay quiet until a sync goes through again.
      if (!failing) toast.warning('Não deu para sincronizar com a nuvem agora.')
      failing = true
      set({
        status: 'error',
        notes: [
          offline()
            ? 'Sem internet. As carreiras continuam salvas neste aparelho.'
            : messageOf(error),
        ],
      })
    } finally {
      syncing = undefined
    }
  })()
  return syncing
}

const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false

/** Keeps the chosen copy of a career that was played on two devices. */
export async function settleConflict(id: string, keep: 'local' | 'remote') {
  const user = get().user
  const conflict = get().conflicts.find((c) => c.id === id)
  if (!user || !conflict) return
  try {
    if (await resolveConflict(client(), user.id, conflict, keep)) await refreshOpenGame([id])
    set({ conflicts: get().conflicts.filter((c) => c.id !== id) })
  } catch (error) {
    set({ notes: [messageOf(error)] })
  }
}

/** Puts a career from this device in the cloud, in place of `replacing` if there is no room. */
export async function moveCareerToCloud(id: string, replacing?: string) {
  const user = get().user
  if (!user) return
  await syncing
  try {
    await moveToCloud(client(), user.id, id, replacing)
  } catch (error) {
    set({ notes: [messageOf(error)] })
  }
  await syncNow()
}

// Careers saved during play go up a little later, once per burst of rounds.
const PUSH_DELAY = 15_000
const pending = new Map<string, ReturnType<typeof setTimeout>>()

function schedulePush(slotId: string) {
  if (!get().user) return
  clearTimeout(pending.get(slotId))
  pending.set(
    slotId,
    setTimeout(() => {
      pending.delete(slotId)
      void push(slotId)
    }, PUSH_DELAY),
  )
}

function push(slotId: string) {
  const user = get().user
  if (!supabase || !user || offline()) return Promise.resolve()
  return pushSlot(supabase, user.id, slotId)
}

/** Sends right away whatever was waiting to go up. */
function flushPushes() {
  const slots = [...pending.keys()]
  slots.forEach((id) => clearTimeout(pending.get(id)))
  pending.clear()
  return Promise.all(slots.map(push))
}

/** E-mails a sign-in link that brings the player back to the account page. */
export async function sendMagicLink(email: string) {
  const { error } = await client().auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${location.origin}/conta` },
  })
  if (error) throw error
}

export async function signInWithGoogle() {
  const { error } = await client().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${location.origin}/conta` },
  })
  if (error) throw error
}

/** Signs out; the careers stay on this device. */
export async function signOut() {
  await flushPushes()
  await client().auth.signOut({ scope: 'local' })
}

export async function saveProfile(profile: Profile) {
  const user = get().user
  if (!user) return
  const { error } = await client()
    .from('profiles')
    .upsert({ user_id: user.id, ...profile, updated_at: new Date().toISOString() })
  if (error) throw error
  set({ profile, profileIsDefault: false })
}

/** Deletes the account with its profile and cloud saves; the careers here stay. */
export async function deleteAccount() {
  const { error } = await client().rpc('delete_account')
  if (error) throw error
  pending.forEach((timer) => clearTimeout(timer))
  pending.clear()
  await db.synced.clear()
  await client().auth.signOut({ scope: 'local' })
}

/** Start-up: picks up the saved session (or one coming back from a sign-in link) and syncs. */
export function initAccount() {
  if (!supabase) {
    set({ ready: true })
    return
  }
  autosaveListeners.add(schedulePush)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushPushes()
  })
  window.addEventListener('online', () => void syncNow())

  supabase.auth.onAuthStateChange((event, session) => {
    const user = session?.user
    const previous = get().user?.id
    set({ ready: true, user: user && { id: user.id, email: user.email } })
    if (!user) {
      set({
        profile: undefined,
        profileIsDefault: true,
        conflicts: [],
        cloud: [],
        notes: [],
        lastSyncAt: undefined,
      })
      return
    }
    // Supabase asks for no awaited calls inside this callback, so the work runs right after it.
    if (user.id !== previous && event !== 'TOKEN_REFRESHED') {
      setTimeout(() => {
        void loadProfile(user)
        void syncNow()
      })
    }
  })
}
