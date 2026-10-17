import type { FileChecksums } from '@shared/types'
import { cn } from 'cn'
import { useEffect, useState } from 'react'
import type { DownloadItem } from '../utils/downloadActions'
import { describeError } from '../utils/format'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './ui/dialog'
import { Input } from './ui/input'

const NAMES: Record<keyof FileChecksums, string> = { md5: 'MD5', sha1: 'SHA-1', sha256: 'SHA-256' }
const KEYS = Object.keys(NAMES) as (keyof FileChecksums)[]

/** A finished file's checksums, and whether one pasted from the website matches any of them.
 * Mounted while open: each opening reads the file afresh. */
export function ChecksumDialog({
  item,
  onClose
}: {
  item: DownloadItem
  onClose: () => void
}): React.JSX.Element {
  const [sums, setSums] = useState<FileChecksums | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expected, setExpected] = useState('')
  const [copied, setCopied] = useState<keyof FileChecksums | null>(null)

  useEffect(() => {
    let live = true
    window.plexo.checksums(item.id).then(
      (result) => {
        if (!live) return
        if (result) setSums(result)
        else setError('That file is no longer where it was saved.')
      },
      (cause) => {
        if (live) setError(describeError(cause))
      }
    )
    return () => {
      live = false
    }
  }, [item.id])

  // Websites list them in either case, sometimes spaced out in groups.
  const wanted = expected.replace(/\s+/g, '').toLowerCase()
  const match = sums && wanted ? KEYS.find((key) => sums[key] === wanted) : undefined

  const copy = (key: keyof FileChecksums): void => {
    if (!sums) return
    navigator.clipboard
      .writeText(sums[key])
      .then(() => setCopied(key))
      .catch(() => {})
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Checksum</DialogTitle>
          <DialogDescription className="break-all">{item.fileName}</DialogDescription>
        </DialogHeader>
        {error ? (
          <div className="text-[12px] text-[var(--color-danger)]">{error}</div>
        ) : !sums ? (
          <div role="status" className="text-[12px] text-muted-foreground">
            Reading the file… a large one takes a while.
          </div>
        ) : (
          <dl className="flex flex-col gap-2">
            {KEYS.map((key) => (
              <div key={key} className="flex items-start gap-2">
                <dt className="w-14 shrink-0 font-mono text-[11px] leading-[1.4] text-muted-foreground">
                  {NAMES[key]}
                </dt>
                <dd
                  className={cn(
                    'min-w-0 flex-1 font-mono text-[11px] leading-[1.4] break-all',
                    match === key && 'text-[var(--color-success)]'
                  )}
                >
                  {sums[key]}
                </dd>
                <button
                  type="button"
                  aria-label={`Copy ${NAMES[key]}`}
                  onClick={() => copy(key)}
                  className="min-h-5 shrink-0 border-none bg-transparent px-1 font-mono text-[11px] leading-none text-primary"
                >
                  {copied === key ? 'Copied' : 'Copy'}
                </button>
              </div>
            ))}
          </dl>
        )}
        <Input
          autoFocus
          aria-label="Checksum to compare"
          placeholder="Paste the checksum from the website"
          value={expected}
          onChange={(event) => setExpected(event.target.value)}
          className="font-mono"
        />
        {sums && wanted && (
          <div
            role="status"
            className={cn(
              'text-[12px]',
              match ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'
            )}
          >
            {match
              ? `Matches the ${NAMES[match]}: the file is intact.`
              : 'Doesn’t match: the file is damaged, or isn’t the one the website lists.'}
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
