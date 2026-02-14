import { useEffect, useMemo, useRef, useState } from 'react'

const TimerMode = {
  CountUp: 'Up',
  CountDown: 'Down',
  CountTo: 'To',
}

const INITIAL_TIMER_DEFS = [{ label: 'Timer 1' }, { label: 'Timer 2' }]

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n))
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

function formatClockFromEpochMs(epochMs) {
  const d = new Date(epochMs)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

function formatHmsFromMs(ms) {
  const abs = Math.abs(ms)
  const totalSeconds = Math.floor(abs / 1000)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`
}

function parseKeypadDigitsToHms(digits) {
  const d = digits.replace(/\D/g, '').slice(-6)
  const padded = d.padStart(6, '0')
  const h = Number(padded.slice(0, 2))
  const m = Number(padded.slice(2, 4))
  const s = Number(padded.slice(4, 6))
  return {
    h: clamp(h, 0, 99),
    m: clamp(m, 0, 59),
    s: clamp(s, 0, 59),
  }
}

function hmsToMs({ h, m, s }) {
  return ((h * 60 + m) * 60 + s) * 1000
}

function getTodayTargetEpochMs({ h, m, s }) {
  const now = new Date()
  const target = new Date(now)
  target.setHours(h, m, s, 0)
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1)
  }
  return target.getTime()
}

function makeTimer(id, label) {
  return {
    id,
    label,
    mode: TimerMode.CountUp,
    running: false,
    startEpochMs: null,
    baseMs: 0,
    countdownInitialMs: 0,
    countToTargetEpochMs: null,
  }
}

function computeDisplayMs(timer, nowEpochMs, allowNegativeTime) {
  const elapsedRaw = timer.running && timer.startEpochMs != null ? nowEpochMs - timer.startEpochMs : 0
  const elapsed = Math.max(0, elapsedRaw)
  const currentBaseMs = timer.baseMs + elapsed

  if (timer.mode === TimerMode.CountUp) {
    return currentBaseMs
  }

  if (timer.mode === TimerMode.CountDown) {
    const remaining = timer.countdownInitialMs - currentBaseMs
    return allowNegativeTime ? remaining : Math.max(0, remaining)
  }

  if (timer.mode === TimerMode.CountTo) {
    if (timer.countToTargetEpochMs == null) return 0
    const remaining = timer.running ? timer.countToTargetEpochMs - nowEpochMs : timer.baseMs
    return allowNegativeTime ? remaining : Math.max(0, remaining)
  }

  return 0
}

function ModeIcon({ mode }) {
  if (mode === TimerMode.CountUp) return <i className="fa-solid fa-fw fa-arrow-up" aria-hidden="true" />
  if (mode === TimerMode.CountDown) return <i className="fa-solid fa-fw fa-arrow-down" aria-hidden="true" />
  return <i className="fa-regular fa-fw fa-clock" aria-hidden="true" />
}

function StatusIcon({ running }) {
  return running ? (
    <i className="fa-solid fa-fw fa-play" aria-hidden="true" />
  ) : (
    <i className="fa-solid fa-fw fa-pause" aria-hidden="true" />
  )
}

export default function App() {
  const [timers, setTimers] = useState(() => INITIAL_TIMER_DEFS.map((t, idx) => makeTimer(`T${idx + 1}`, t.label)))
  const [selectedTimerId, setSelectedTimerId] = useState(() => `T1`)

  const [rehearsalOrLive, setRehearsalOrLive] = useState(null)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [clearBehavior, setClearBehavior] = useState('resetAll')
  const [allowNegativeTime, setAllowNegativeTime] = useState(false)

  const optionsButtonRef = useRef(null)
  const optionsPanelRef = useRef(null)

  const [keypadDigits, setKeypadDigits] = useState('')

  const nextTimerNumberRef = useRef(INITIAL_TIMER_DEFS.length + 1)

  const [nowEpochMs, setNowEpochMs] = useState(() => Date.now())
  const tickRef = useRef(null)

  useEffect(() => {
    tickRef.current = window.setInterval(() => setNowEpochMs(Date.now()), 100)
    return () => {
      if (tickRef.current != null) window.clearInterval(tickRef.current)
      tickRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!optionsOpen) return

    function onPointerDown(e) {
      const panel = optionsPanelRef.current
      const button = optionsButtonRef.current

      if (panel && panel.contains(e.target)) return
      if (button && button.contains(e.target)) return

      setOptionsOpen(false)
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') setOptionsOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [optionsOpen])

  const selectedTimer = useMemo(() => timers.find((t) => t.id === selectedTimerId) ?? timers[0], [timers, selectedTimerId])
  const selectedDisplayMs = useMemo(
    () => computeDisplayMs(selectedTimer, nowEpochMs, allowNegativeTime),
    [selectedTimer, nowEpochMs, allowNegativeTime],
  )
  const keypadHms = useMemo(() => parseKeypadDigitsToHms(keypadDigits), [keypadDigits])
  const keypadPreview = useMemo(() => `${pad2(keypadHms.h)}:${pad2(keypadHms.m)}:${pad2(keypadHms.s)}`, [keypadHms])

  const timerTargetTextById = useMemo(() => {
    const map = {}
    for (const t of timers) {
      if (t.id === selectedTimerId && keypadDigits.length > 0) {
        map[t.id] = keypadPreview
        continue
      }

      if (t.mode === TimerMode.CountDown) {
        map[t.id] = formatHmsFromMs(t.countdownInitialMs)
      } else if (t.mode === TimerMode.CountTo) {
        map[t.id] = t.countToTargetEpochMs != null ? formatClockFromEpochMs(t.countToTargetEpochMs) : '00:00:00'
      } else {
        map[t.id] = '00:00:00'
      }
    }
    return map
  }, [timers, selectedTimerId, keypadDigits, keypadPreview])

  useEffect(() => {
    if (allowNegativeTime) return

    setTimers((prev) =>
      prev.map((t) => {
        if (!t.running) return t
        if (t.mode === TimerMode.CountDown) {
          const ms = computeDisplayMs(t, Date.now(), false)
          if (ms > 0) return t
          return {
            ...t,
            running: false,
            startEpochMs: null,
            baseMs: t.countdownInitialMs,
          }
        }

        if (t.mode === TimerMode.CountTo) {
          if (t.countToTargetEpochMs == null) return t
          const remaining = t.countToTargetEpochMs - Date.now()
          if (remaining > 0) return t
          return {
            ...t,
            running: false,
            startEpochMs: null,
            baseMs: 0,
          }
        }

        return t
      }),
    )
  }, [nowEpochMs, allowNegativeTime])

  function updateTimer(timerId, updater) {
    setTimers((prev) => prev.map((t) => (t.id === timerId ? updater(t) : t)))
  }

  function addTimer() {
    const n = nextTimerNumberRef.current
    nextTimerNumberRef.current += 1
    const id = `T${n}`

    setTimers((prev) => [...prev, makeTimer(id, `Timer ${n}`)])
    setSelectedTimerId(id)
  }

  function deleteTimer(timerId) {
    setTimers((prev) => {
      if (prev.length <= 1) return prev
      const next = prev.filter((t) => t.id !== timerId)
      if (next.length === prev.length) return prev

      if (selectedTimerId === timerId) {
        const nextSelected = next[0]?.id
        if (nextSelected) setSelectedTimerId(nextSelected)
      }

      return next
    })
  }

  function pauseTimer(timerId) {
    updateTimer(timerId, (t) => {
      if (!t.running) return t
      const now = Date.now()
      const elapsed = t.startEpochMs != null ? now - t.startEpochMs : 0
      return {
        ...t,
        running: false,
        startEpochMs: null,
        baseMs: t.baseMs + elapsed,
      }
    })
  }

  function clearTimer(timerId) {
    updateTimer(timerId, (t) => {
      if (clearBehavior === 'keepTarget') {
        return {
          ...t,
          running: false,
          startEpochMs: null,
          baseMs: 0,
        }
      }

      return {
        ...t,
        running: false,
        startEpochMs: null,
        baseMs: 0,
        countdownInitialMs: 0,
        countToTargetEpochMs: null,
      }
    })
    setKeypadDigits('')
  }

  function startSelectedTimer() {
    const digits = keypadDigits
    const hms = digits.length > 0 ? parseKeypadDigitsToHms(digits) : null
    const ms = hms ? hmsToMs(hms) : null

    setTimers((prev) =>
      prev.map((t) => {
        if (t.id !== selectedTimerId) return t
        if (t.running) return t

        const now = Date.now()
        const next = { ...t }

        if (hms && ms != null) {
          if (next.mode === TimerMode.CountUp) {
            next.running = false
            next.startEpochMs = null
            next.baseMs = ms
          } else if (next.mode === TimerMode.CountDown) {
            next.running = false
            next.startEpochMs = null
            next.baseMs = 0
            next.countdownInitialMs = ms
          } else if (next.mode === TimerMode.CountTo) {
            const targetEpochMs = getTodayTargetEpochMs(hms)
            const remaining = targetEpochMs - now
            next.running = false
            next.startEpochMs = null
            next.baseMs = allowNegativeTime ? remaining : Math.max(0, remaining)
            next.countToTargetEpochMs = targetEpochMs
          }
        }

        if (next.mode === TimerMode.CountTo && next.countToTargetEpochMs != null) {
          const remaining = next.countToTargetEpochMs - now
          next.baseMs = allowNegativeTime ? remaining : Math.max(0, remaining)
        }

        next.running = true
        next.startEpochMs = now
        return next
      }),
    )

    if (digits.length > 0) setKeypadDigits('')
  }

  function setModeForSelectedTimer(mode) {
    updateTimer(selectedTimerId, (t) => {
      const wasRunning = t.running
      const now = Date.now()
      const elapsed = wasRunning && t.startEpochMs != null ? now - t.startEpochMs : 0
      const nextBaseMs = wasRunning ? t.baseMs + elapsed : t.baseMs

      return {
        ...t,
        mode,
        running: false,
        startEpochMs: null,
        baseMs: mode === TimerMode.CountUp ? nextBaseMs : 0,
      }
    })
  }

  const actionLabel = selectedTimer.running ? 'Pause' : 'Start'

  function toggleRehearsalOrLive(next) {
    setRehearsalOrLive((prev) => (prev === next ? null : next))
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-base-300 text-base-content select-none">
      <header className="px-3 py-2 grid grid-cols-[auto_1fr_auto] items-center gap-2 border-b border-base-200">
        <div className="flex items-center gap-2 min-w-0">
          <div className="size-9 rounded-xl text-primary-content flex items-center justify-center" style={{ backgroundColor: '#f0f4ff' }}>
            <img src="/NextUp.Logo.Dark.svg" alt="NextUp Logo" width="24" height="24" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold leading-tight truncate">NextUp</div>
            <div className="text-xs opacity-70 leading-tight truncate">The Free Production Timer</div>
          </div>
        </div>

        <div className="flex justify-center">
          <div className="join">
            <button
              className={`btn btn-xl join-item min-h-11 ${rehearsalOrLive === 'rehearsal' ? 'btn-info' : 'btn-default'}`}
              onClick={() => toggleRehearsalOrLive('rehearsal')}
            >
              Rehearsal
            </button>
            <button
              className={`btn btn-xl join-item min-h-11 ${rehearsalOrLive === 'live' ? 'btn-error' : 'btn-default'}`}
              onClick={() => toggleRehearsalOrLive('live')}
            >
              Live
            </button>
          </div>
        </div>

        <div className="flex items-center gap-5 justify-end">
          <button className="btn btn-xl btn-success min-h-11" onClick={addTimer}>
            <span className="inline-flex items-center gap-3">
              <i className="fa-solid fa-fw fa-plus" aria-hidden="true" />
              Add
            </span>
          </button>

          <div className="relative">
            <button
              ref={optionsButtonRef}
              className="btn btn-xl btn-primary min-h-11"
              onClick={() => setOptionsOpen((v) => !v)}
            >
              Options
            </button>

            {optionsOpen ? (
              <div
                ref={optionsPanelRef}
                className="absolute right-0 mt-2 w-72 rounded-2xl border border-base-200 p-3 bg-base-200 z-50"
              >
                <div className="text-sm font-semibold mb-2">Options</div>

                <label className="block text-sm mb-1">Clear behavior</label>
                <select
                  className="select select-bordered w-full min-h-11"
                  value={clearBehavior}
                  onChange={(e) => setClearBehavior(e.target.value)}
                >
                  <option value="resetAll">Reset to 00:00:00 and clear target</option>
                  <option value="keepTarget">Reset to 00:00:00 but keep target</option>
                </select>

                <label className="block text-sm mb-1 mt-3">Negative time</label>
                <select
                  className="select select-bordered w-full min-h-11"
                  value={allowNegativeTime ? 'on' : 'off'}
                  onChange={(e) => setAllowNegativeTime(e.target.value === 'on')}
                >
                  <option value="off">No negative time</option>
                  <option value="on">Allow negative time</option>
                </select>

                <button className="btn btn-primary w-full mt-3 min-h-11" onClick={() => setOptionsOpen(false)}>
                  Close
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <main className="flex-1 grid grid-rows-[auto_1fr] gap-3 p-3 overflow-hidden">
        <section className="grid grid-cols-1 gap-3">
          {timers.map((t) => {
            const ms = computeDisplayMs(t, nowEpochMs, allowNegativeTime)
            const isSelected = t.id === selectedTimerId
            const isNegative = ms < 0
            const targetText = timerTargetTextById[t.id]

            const subline =
              t.mode === TimerMode.CountUp
                ? 'Count up'
                : t.mode === TimerMode.CountDown
                  ? 'Count down'
                  : 'Count to'

            return (
              <button
                key={t.id}
                className={`text-left rounded-2xl bg-base-200 p-4 flex flex-col gap-3 border ${
                  isSelected ? 'border-error ring-2 ring-error/40' : 'border-base-200'
                }`}
                onClick={() => setSelectedTimerId(t.id)}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold truncate">{t.label}</div>

                  <div className="flex items-center gap-4 opacity-70 text-sm shrink-0">
                    <span className="flex items-center gap-2">
                      <ModeIcon mode={t.mode} />
                      <span>{subline}</span>
                    </span>

                    <span className="flex items-center gap-2">
                      <StatusIcon running={t.running} />
                      <span>{t.running ? 'Running' : 'Paused'}</span>
                    </span>

                    {timers.length > 1 ? (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          deleteTimer(t.id)
                        }}
                        aria-label={`Delete ${t.label}`}
                      >
                        <i className="fa-solid fa-fw fa-trash" aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="flex items-baseline justify-between gap-3">
                  <div
                    className={`font-mono tabular-nums tracking-tight text-5xl md:text-6xl leading-none ${
                      isNegative ? 'text-warning' : 'text-error'
                    }`}
                  >
                    {isNegative ? '-' : ''}
                    {formatHmsFromMs(ms)}
                  </div>
                  {targetText ? (
                    <div className="font-mono tabular-nums tracking-tight text-5xl md:text-6xl leading-none text-success">
                      {targetText}
                    </div>
                  ) : null}
                </div>
              </button>
            )
          })}
        </section>

        <section className="grid grid-cols-1 md:grid-cols-[1fr_360px] gap-3 overflow-hidden">
          <div className="rounded-2xl bg-base-200 p-3 md:p-4 overflow-hidden flex flex-col">
            <div className="grid grid-cols-3 gap-2 flex-1 auto-rows-fr">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                <button
                  key={d}
                  className="btn btn-soft btn-lg h-full !text-5xl leading-none"
                  onClick={() => setKeypadDigits((prev) => (prev + d).slice(-6))}
                >
                  {d}
                </button>
              ))}

              <button className="btn btn-accent btn-lg h-full !text-5xl leading-none" onClick={() => setKeypadDigits('')}>
                CLR
              </button>
              <button
                className="btn btn-soft btn-lg h-full !text-5xl leading-none"
                onClick={() => setKeypadDigits((prev) => (prev + '0').slice(-6))}
              >
                0
              </button>
              <button
                className="btn btn-warning btn-lg h-full !text-5xl leading-none"
                onClick={() => setKeypadDigits((prev) => prev.slice(0, -1))}
                disabled={keypadDigits.length === 0}
              >
                DEL
              </button>
            </div>
          </div>

          <div className="rounded-2xl p-3 md:p-4">
            <header className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold leading-tight">Controls</h2>
            </header>
            <div className="mt-2 font-mono tabular-nums text-2xl">{formatHmsFromMs(selectedDisplayMs)}</div>

            <div className="mt-2 flex items-center gap-2 opacity-70 text-sm">
              <StatusIcon running={selectedTimer.running} />
              <span>{selectedTimer.running ? 'Running' : 'Paused'}</span>
            </div>

            <div className="mt-3 rounded-2xl border border-base-300 bg-base-300">
              <div className="join join-vertical w-full">
                <button
                  className={`btn join-item min-h-14 justify-start text-2xl ${
                    selectedTimer.mode === TimerMode.CountUp ? 'btn-primary' : 'btn-default'
                  }`}
                  onClick={() => setModeForSelectedTimer(TimerMode.CountUp)}
                >
                  <span className="w-10"><ModeIcon mode={TimerMode.CountUp} /></span>
                  <span className="inline-flex items-center justify-center gap-2 w-full">
                    Up
                  </span>
                </button>
                <button
                  className={`btn join-item min-h-14 justify-start text-2xl ${
                    selectedTimer.mode === TimerMode.CountDown ? 'btn-primary' : 'btn-default'
                  }`}
                  onClick={() => setModeForSelectedTimer(TimerMode.CountDown)}
                >
                  <span className="w-10"><ModeIcon mode={TimerMode.CountDown} /></span>
                  <span className="inline-flex items-center justify-center gap-2 w-full">
                    
                    Down
                  </span>
                </button>
                <button
                  className={`btn join-item min-h-14 justify-start text-2xl ${
                    selectedTimer.mode === TimerMode.CountTo ? 'btn-primary' : 'btn-default'
                  }`}
                  onClick={() => setModeForSelectedTimer(TimerMode.CountTo)}
                >
                  <span className="w-10"><ModeIcon mode={TimerMode.CountTo} /></span>
                  <span className="inline-flex items-center justify-center gap-2 w-full">
                    To
                  </span>
                </button>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2">
              <button
                className={`btn min-h-20 text-2xl ${selectedTimer.running ? 'btn-warning' : 'btn-success'}`}
                onClick={() => {
                  if (selectedTimer.running) {
                    pauseTimer(selectedTimerId)
                    return
                  }

                  startSelectedTimer()
                }}
              >
                <span className="w-10">
                  {selectedTimer.running ? (
                    <i className="fa-solid fa-fw fa-pause" aria-hidden="true" />
                  ) : (
                    <i className="fa-solid fa-fw fa-play" aria-hidden="true" />
                  )}
                </span>
                <span className="inline-flex items-center gap-3 w-full justify-center">
                  {actionLabel}
                </span>
              </button>
              <button className="btn btn-outline min-h-16 text-2xl" onClick={() => clearTimer(selectedTimerId)}>
                <span className="w-10"><i className="fa-solid fa-trash" aria-hidden="true" /></span>
                <span className="inline-flex items-center gap-3 w-full justify-center">
                  Clear Timer
                </span>
              </button>
            </div>

            <div className="mt-3 text-xs opacity-70">
              Mode: {selectedTimer.mode}
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
