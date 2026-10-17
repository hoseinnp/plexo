import { execFile } from 'node:child_process'
import { Menu, Notification, type BrowserWindow } from 'electron'
import { IpcChannels } from '../shared/ipc-channels'
import type { WhenDone } from '../shared/types'

// What the PC does once every download is done, as FDM offers. Not saved: it's for this batch,
// and a shutdown left on would greet the next launch.

/** Time to see the notification and call it off. */
const GRACE_MS = 60_000

const LABELS: Record<WhenDone, string> = {
  nothing: 'Do Nothing',
  sleep: 'Sleep',
  shutdown: 'Shut Down'
}

let choice: WhenDone = 'nothing'
/** A download finished since the choice was made: an idle Plexo alone isn't "done". */
let finished = false
let timer: NodeJS.Timeout | undefined
let getWindow: () => BrowserWindow | null = () => null

export function startWhenDone(window: () => BrowserWindow | null): void {
  getWindow = window
}

export function whenDone(): WhenDone {
  return choice
}

function set(next: WhenDone): void {
  choice = next
  finished = false
  clearTimeout(timer)
  timer = undefined
  const window = getWindow()
  if (window && !window.isDestroyed()) window.webContents.send(IpcChannels.whenDoneChanged, choice)
}

export function showWhenDoneMenu(): void {
  const window = getWindow()
  if (!window) return
  Menu.buildFromTemplate(
    (Object.keys(LABELS) as WhenDone[]).map((id) => ({
      label: LABELS[id],
      type: 'radio' as const,
      checked: id === choice,
      click: () => set(id)
    }))
  ).popup({ window })
}

export function downloadFinished(): void {
  if (choice !== 'nothing') finished = true
}

/** Whether anything is downloading or waiting its turn: once nothing is, the choice is carried
 * out after GRACE_MS, unless a download starts or the user calls it off first. */
export function activityChanged(busy: boolean): void {
  if (busy) {
    clearTimeout(timer)
    timer = undefined
    return
  }
  if (choice === 'nothing' || !finished || timer) return
  const action = choice
  notify(action)
  timer = setTimeout(() => {
    set('nothing')
    act(action)
  }, GRACE_MS)
}

function notify(action: WhenDone): void {
  if (!Notification.isSupported()) return
  const notification = new Notification({
    title: 'All downloads are done',
    body: `This PC will ${action === 'sleep' ? 'sleep' : 'shut down'} in 1 minute. Click to cancel.`
  })
  notification.on('click', () => {
    set('nothing')
    const window = getWindow()
    if (window && !window.isDestroyed()) {
      window.show()
      window.focus()
    }
  })
  notification.show()
}

function act(action: WhenDone): void {
  // shortcut: Windows only, the one platform this build is for; add pmset/systemctl to go wider.
  if (process.platform !== 'win32') return
  const [file, args] =
    action === 'shutdown'
      ? ['shutdown', ['/s', '/t', '0']]
      : // rundll32's SetSuspendState hibernates when hibernation is on; this always sleeps.
        [
          'powershell',
          [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Application]::SetSuspendState("Suspend", $false, $false)'
          ]
        ]
  execFile(file, args as string[], (error) => {
    if (error) console.error('[plexo] when done', error)
  })
}
