import { Clock3 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useDownloadSchedule } from '../hooks/useDownloadSchedule'
import { Button } from './ui/button'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'

const PRESETS: [label: string, minutes: number][] = [
  ['30 min', 30],
  ['1 h', 60],
  ['2 h', 120],
  ['4 h', 240]
]

const sectionLabel =
  'font-mono text-[10.5px] leading-none font-medium tracking-[0.18em] text-muted-foreground uppercase'

/** "1:24" left, or "12 min". */
function remaining(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000))
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`
    : `${minutes} min`
}

/** The next time `hhmm` (from a time input) comes round: today, or tomorrow if it has passed. */
function nextAt(hhmm: string, now: number): number | null {
  const [hours, minutes] = hhmm.split(':').map(Number)
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null
  const at = new Date(now)
  at.setHours(hours, minutes, 0, 0)
  if (at.getTime() <= now) at.setDate(at.getDate() + 1)
  return at.getTime()
}

/** The clock in the list's header: opens the download schedule's state (edited in Speed & data
 * limits) and the stop timer, which pauses everything at a time picked (see main/stopTimer.ts).
 * Lit while either is on; a running timer shows what's left beside it. */
export function ScheduleIndicator({
  onClick,
  onlyWhenOn = false
}: {
  onClick: () => void
  /** Hidden while neither is on: where room is short (the selection toolbar). */
  onlyWhenOn?: boolean
}): React.JSX.Element | null {
  const { schedule, message } = useDownloadSchedule()
  const [open, setOpen] = useState(false)
  const [stopAt, setStopAt] = useState<number | null>(null)
  const [time, setTime] = useState('')
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    window.plexo.stopTimer().then(setStopAt, () => {})
    return window.plexo.onStopTimer(setStopAt)
  }, [])
  useEffect(() => {
    if (stopAt === null) return
    const timer = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(timer)
  }, [stopAt])

  const set = (at: number | null): void => {
    setNow(Date.now())
    void window.plexo.setStopTimer(at)
  }
  const lit = !!schedule?.enabled || stopAt !== null
  const clock = (at: number): string =>
    new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

  if (onlyWhenOn && !lit) return null
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="secondary"
            size={stopAt === null ? 'icon' : 'default'}
            aria-label={
              stopAt !== null
                ? `Schedule and stop timer: pauses at ${clock(stopAt)}`
                : schedule?.enabled
                  ? 'Schedule and stop timer: schedule on'
                  : 'Schedule and stop timer'
            }
            className={lit ? 'text-primary' : 'text-muted-foreground'}
          >
            <Clock3 />
            {stopAt !== null && (
              <span className="font-mono text-[12px] tabular-nums">{remaining(stopAt - now)}</span>
            )}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-72 gap-3">
        <div className="flex flex-col gap-2">
          <div className={sectionLabel}>Schedule</div>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1 text-[12.5px]">
              {schedule?.enabled ? (message ?? 'On') : 'Off'}
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                setOpen(false)
                onClick()
              }}
            >
              Edit…
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t-[0.5px] border-border pt-3">
          <div className={sectionLabel}>Stop timer</div>
          {stopAt !== null ? (
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1 text-[12.5px]">
                Pauses everything at {clock(stopAt)}
              </div>
              <Button type="button" size="sm" variant="secondary" onClick={() => set(null)}>
                Cancel
              </Button>
            </div>
          ) : (
            <>
              <div className="text-[12px] text-muted-foreground">Pause everything in…</div>
              <div className="flex gap-1.5">
                {PRESETS.map(([label, minutes]) => (
                  <Button
                    key={label}
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="flex-1 px-0"
                    onClick={() => set(Date.now() + minutes * 60_000)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              <form
                className="flex items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  const at = nextAt(time, Date.now())
                  if (at !== null) set(at)
                }}
              >
                <label htmlFor="stop-at" className="text-[12px] text-muted-foreground">
                  or at
                </label>
                <input
                  id="stop-at"
                  type="time"
                  value={time}
                  onChange={(event) => setTime(event.target.value)}
                  className="h-7 min-w-0 flex-1 rounded-md border border-input bg-[var(--input-bg)] px-2 font-mono text-[12.5px] text-foreground outline-none focus:border-ring"
                />
                <Button type="submit" size="sm" disabled={!time}>
                  Set
                </Button>
              </form>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
