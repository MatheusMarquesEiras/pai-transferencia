import { useState } from 'react'

export interface Settings {
  deleteDelay: boolean
}

const DEFAULTS: Settings = { deleteDelay: true }
const KEY = 'app-settings'

function load(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return { ...DEFAULTS }
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(load)

  const update = (patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      localStorage.setItem(KEY, JSON.stringify(next))
      return next
    })
  }

  return { settings, update }
}
