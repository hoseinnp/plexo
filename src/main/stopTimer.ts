import { Notification, type BrowserWindow } from 'electron'
import { IpcChannels } from '../shared/ipc-channels'

// Pauses every download at a time the user picks ("stop in 2 hours"), from the clock in the
// list's header. Not saved: like When done, it's for now, and a quit calls it off.

let at: number | null = null
let timer: NodeJS.Timeout | undefined
let getWindow: () => BrowserWindow | null = () => null
let pauseAll: () => Promise<void> = async () => {}

export function startStopTimer(
  window: () => BrowserWindow | null,
  pauseEverything: () => Promise<void>
): void {
  getWindow = window
  pauseAll = pauseEverything
}

/** When everything will be paused, or null with no timer set. */
export function stopTimer(): number | null {
  return at
}

/** Sets the timer for `next` (a time, in ms since the epoch), or calls it off with null. */
export function setStopTimer(next: number | null): void {
  clearTimeout(timer)
  timer = undefined
  at = next !== null && Number.isFinite(next) && next > Date.now() ? next : null
  if (at !== null) timer = setTimeout(stop, at - Date.now())
  const window = getWindow()
  if (window && !window.isDestroyed()) window.webContents.send(IpcChannels.stopTimerChanged, at)
}

function stop(): void {
  setStopTimer(null)
  void pauseAll().catch((error) => console.error('[plexo] stop timer', error))
  if (!Notification.isSupported()) return
  new Notification({
    title: 'Downloads paused',
    body: 'The stop timer ran out. Resume them whenever you like.'
  }).show()
}
