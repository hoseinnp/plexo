import type { ProbeResult } from '@shared/types'
import { cn } from 'cn'
import { AlertTriangle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNetworkUsage } from '../hooks/useNetworks'
import { useNetworkVisuals } from '../hooks/useNetworkVisuals'
import { useAppStore } from '../store/useAppStore'
import { batchDir, folderName } from '../utils/fileCategory'
import { describeError, fileExtensionBadge, formatBytes, toDisplayPath } from '../utils/format'
import { Button } from './ui/button'
import { Checkbox } from './ui/checkbox'
import { DialogTitle } from './ui/dialog'
import { Input } from './ui/input'

/** One link of a batch: pasted (no linkId), or handed over by the browser with its sign-in. */
export interface BatchItem {
  key: string
  url: string
  linkId?: string
  probe?: ProbeResult
}

type Check =
  | { status: 'probing' }
  | { status: 'ready'; result: ProbeResult }
  | { status: 'error'; message: string }

/** Links looked up together: enough to fill the list quickly, not so many a server minds. */
const PROBES_AT_ONCE = 4

const labelClass = 'w-16 shrink-0 text-[12.5px] text-[var(--text-secondary)]'

/** New download for several links at once: each is looked up and listed, and they start together
 * into one folder, in the order given (the queue takes the ones past Downloads at once). Each
 * goes over the networks the last download used. */
export function BatchDownloadForm({
  items,
  onDone
}: {
  items: BatchItem[]
  onDone: () => void
}): React.JSX.Element {
  const homeDir = useAppStore((store) => store.homeDir)
  const destinationDir = useAppStore((store) => store.destinationDir)
  const setDestinationDir = useAppStore((store) => store.setDestinationDir)
  const sortByType = useAppStore((store) => store.sortByType)
  const setSortByType = useAppStore((store) => store.setSortByType)
  const interfaces = useAppStore((store) => store.interfaces)
  const networkPreferences = useAppStore((store) => store.networkPreferences)
  const usage = useNetworkUsage(true)
  const networkVisual = useNetworkVisuals()

  const [checks, setChecks] = useState<Record<string, Check>>({})
  const [skipped, setSkipped] = useState<string[]>([])
  const [folder, setFolder] = useState('')
  const [freeBytes, setFreeBytes] = useState<number | null>(null)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const asked = useRef(new Set<string>())

  // Links the browser already looked up keep that answer: asking again could spend a one-use link.
  const checkOf = (item: BatchItem): Check =>
    item.probe
      ? { status: 'ready', result: item.probe }
      : (checks[item.key] ?? { status: 'probing' })

  useEffect(() => {
    const todo = items.filter((item) => !item.probe && !asked.current.has(item.key))
    for (const item of todo) asked.current.add(item.key)
    let next = 0
    const work = async (): Promise<void> => {
      while (next < todo.length) {
        const item = todo[next++]
        const check: Check = await window.plexo.probeUrl(item.url).then(
          (result) => ({ status: 'ready', result }),
          (error) => ({ status: 'error', message: describeError(error) })
        )
        setChecks((current) => ({ ...current, [item.key]: check }))
      }
    }
    for (let i = 0; i < PROBES_AT_ONCE; i++) void work()
  }, [items])

  useEffect(() => {
    let live = true
    window.plexo
      .freeSpace(destinationDir)
      .catch(() => null)
      .then((free) => {
        if (live) setFreeBytes(free)
      })
    return () => {
      live = false
    }
  }, [destinationDir])

  const ready = items.flatMap((item) => {
    const check = checkOf(item)
    return check.status === 'ready' ? [{ item, result: check.result }] : []
  })
  const chosen = ready.filter(({ item }) => !skipped.includes(item.key))
  const probing = items.some((item) => checkOf(item).status === 'probing')
  const totalBytes = chosen.reduce((sum, { result }) => sum + (result.totalBytes ?? 0), 0)
  const tooBig = freeBytes !== null && totalBytes > freeBytes

  const subfolder = folderName(folder)
  const separator = window.plexo.platform === 'win32' ? '\\' : '/'
  const first = chosen[0]?.result.suggestedFileName ?? ''
  const dirFor = (result: ProbeResult): string =>
    batchDir(destinationDir, result.suggestedFileName, {
      folder: subfolder,
      // On its own a torrent keeps the folder picked, as one download does; in the batch's folder
      // it goes with the rest.
      sort: sortByType && (subfolder !== '' || result.kind === 'http'),
      first,
      separator
    })
  // What Save to shows: the folder they all go into, or the one picked when each is sorted alone.
  const shownDir = subfolder && chosen[0] ? dirFor(chosen[0].result) : destinationDir

  // The networks the last download used, less any out of data. Not picked here: a batch is for
  // when what differs is only the link.
  const isReached = (id: string): boolean => {
    const dataLimit = networkPreferences[id]?.dataLimit
    return dataLimit !== undefined && (usage[id] ?? 0) >= dataLimit
  }
  const networks = interfaces.filter(
    (iface) => !isReached(iface.id) && !networkPreferences[iface.id]?.off
  )

  const canStart = chosen.length > 0 && networks.length > 0 && !starting
  const label = starting
    ? 'Starting'
    : chosen.length === 0 && probing
      ? 'Checking'
      : `Download ${chosen.length}`

  const handleBrowse = async (): Promise<void> => {
    const picked = await window.plexo.chooseDestinationFolder(destinationDir)
    if (picked) setDestinationDir(picked)
  }

  const handleStart = async (): Promise<void> => {
    if (!canStart) return
    setStarting(true)
    setStartError(null)
    const ids = networks.map((iface) => iface.id)
    const started = new Set<string>()
    let failure: unknown
    // One at a time, so they queue in the order listed: part 1 before part 2.
    for (const { item, result } of chosen) {
      const splittable = result.supportsRanges && result.totalBytes !== null
      const common = {
        url: result.finalUrl,
        destinationDir: dirFor(result),
        suggestedFileName: result.suggestedFileName,
        totalBytes: result.totalBytes ?? 0,
        supportsRanges: splittable,
        interfaceIds: splittable ? ids : ids.slice(0, 1),
        etag: result.etag,
        lastModified: result.lastModified
      }
      try {
        await window.plexo.startDownload(
          result.kind === 'torrent'
            ? { ...common, kind: 'torrent', infoHash: result.torrent.infoHash }
            : { ...common, kind: 'http' },
          item.linkId
        )
        started.add(item.key)
      } catch (error) {
        failure ??= error
      }
    }

    const store = useAppStore.getState()
    const pasted = store.batchLinks !== null
    // Still on the clipboard afterwards: not offered again.
    if (pasted) useAppStore.setState({ startedUrl: items.map((item) => item.url).join('\n') })
    const failed = chosen.map(({ item }) => item).filter((item) => !started.has(item.key))
    for (const item of items) {
      // Unticked or unusable ones go too, unless something has to be tried again.
      if (item.linkId && (started.has(item.key) || failed.length === 0)) {
        store.dropLink(item.linkId, started.has(item.key))
      }
    }
    if (failed.length === 0) {
      onDone()
      return
    }
    // What didn't start stays listed, with why.
    if (pasted) store.openBatch(failed.map((item) => item.url))
    else if (failed[0].linkId) store.showLink(failed[0].linkId)
    setStartError(`${failed.length} couldn’t start: ${describeError(failure)}`)
    setStarting(false)
  }

  return (
    <form
      className="flex min-h-0 flex-col"
      onSubmit={(event) => {
        event.preventDefault()
        void handleStart()
      }}
    >
      <div className="flex items-center gap-2 border-b-[0.5px] border-border py-3 pr-3 pl-5">
        <DialogTitle className="flex-1 py-1 text-[16px] font-semibold">
          New download · {items.length} links
        </DialogTitle>
      </div>

      <div className="flex min-h-0 flex-col gap-3.5 overflow-y-auto px-5 py-4">
        <ul aria-label="Links" className="flex max-h-[260px] flex-col gap-1 overflow-y-auto">
          {items.map((item) => {
            const check = checkOf(item)
            const name = check.status === 'ready' ? check.result.suggestedFileName : item.url
            const on = check.status === 'ready' && !skipped.includes(item.key)
            return (
              <li key={item.key} className="flex items-center gap-2.5 rounded-md px-1 py-1">
                <Checkbox
                  aria-label={`Download ${name}`}
                  checked={on}
                  disabled={check.status !== 'ready'}
                  onCheckedChange={(checked) =>
                    setSkipped((current) =>
                      checked ? current.filter((key) => key !== item.key) : [...current, item.key]
                    )
                  }
                />
                <div className="flex size-7 shrink-0 items-center justify-center rounded-md border-[0.5px] border-border bg-card font-mono text-[8.5px] font-semibold text-muted-foreground">
                  {check.status === 'ready' && check.result.kind === 'torrent'
                    ? 'TOR'
                    : fileExtensionBadge(name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div
                    className={cn(
                      'truncate text-[13px]',
                      check.status === 'ready' ? 'font-medium' : 'font-mono text-muted-foreground'
                    )}
                  >
                    {name}
                  </div>
                  <div
                    className={cn(
                      'truncate font-mono text-[11px]',
                      check.status === 'error'
                        ? 'text-[var(--color-danger)]'
                        : 'text-muted-foreground'
                    )}
                  >
                    {check.status === 'probing'
                      ? 'Checking…'
                      : check.status === 'error'
                        ? check.message
                        : check.result.totalBytes !== null
                          ? formatBytes(check.result.totalBytes)
                          : 'size unknown'}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>

        <div className="font-mono text-[11.5px] text-muted-foreground">
          {chosen.length} of {items.length} selected
          {totalBytes > 0 && ` · ${formatBytes(totalBytes)}`}
          {probing && ' · checking the rest…'}
        </div>

        <div className="flex items-center gap-3">
          <div className={labelClass}>Save to</div>
          <div className="min-w-0 flex-1 truncate font-mono text-[12.5px]">
            {toDisplayPath(shownDir, homeDir)}
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={handleBrowse}>
            Change
          </Button>
        </div>
        <label className="-mt-2 flex items-center gap-2 pl-[76px] text-[12.5px] text-[var(--text-secondary)]">
          <Checkbox checked={sortByType} onCheckedChange={setSortByType} />
          Sort into folders by type (Video, Music, Programs…)
        </label>
        <div className="flex items-center gap-3">
          <label htmlFor="batch-folder" className={labelClass}>
            Folder
          </label>
          <Input
            id="batch-folder"
            value={folder}
            onChange={(event) => setFolder(event.target.value)}
            placeholder="Put them in a new folder (optional), e.g. Season 2"
            spellCheck={false}
          />
        </div>

        <div className="flex items-center gap-3">
          <div className={labelClass}>Networks</div>
          <div className="min-w-0 flex-1 truncate text-[12.5px]">
            {networks
              .map((iface) => networkVisual(iface.id, iface.kind, iface.displayName).name)
              .join(' + ') || '—'}
          </div>
        </div>

        {interfaces.length > 0 && networks.length === 0 && (
          <div className="flex items-start gap-2 text-[12px] leading-snug text-[var(--color-usb-text)]">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            The networks your last download used have reached their data limit. Pick another in a
            single download first.
          </div>
        )}
        {tooBig && (
          <div className="flex items-start gap-2 text-[12px] leading-snug text-[var(--color-usb-text)]">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            Not enough room: these need {formatBytes(totalBytes)}, and the drive has{' '}
            {formatBytes(freeBytes ?? 0)} free.
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t-[0.5px] border-border px-4 py-2">
        {startError ? (
          <div className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--color-danger)]">
            {startError}
          </div>
        ) : (
          <div className="flex-1" />
        )}
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!canStart}>
          {label}
        </Button>
      </div>
    </form>
  )
}
