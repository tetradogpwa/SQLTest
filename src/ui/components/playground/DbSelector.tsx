/**
 * DbSelector — dropdown that picks the active database for the
 * playground.
 *
 * The component is dumb: it gets the list of databases from
 * `useUserDatabases` and emits `onChange(dbId)`. The playground owns
 * `setActiveDb` + the filename registration.
 *
 * The default option is the built-in `playground` SQLite seed. We
 * always render it first so the playground is usable even when the
 * user has not created / imported any DB.
 */
import { useId, useMemo } from 'react'
import { Database as DatabaseIcon } from 'lucide-react'

import { useUserDatabases } from '../../../hooks/useUserDatabases'
import { useTranslation } from '../../../core/i18n/i18n'
import styles from './DbSelector.module.css'

export interface DbSelectorProps {
  /** Currently active numeric dbId (or `null` for the built-in playground). */
  value: number | null
  onChange: (dbId: number | null) => void
  /** Optional list of extra "synthetic" entries (e.g. the built-in playground). */
  builtIn?: ReadonlyArray<{ value: number | null; label: string }>
}

const DEFAULT_BUILTIN: ReadonlyArray<{ value: number | null; label: string }> = [
  { value: null, label: 'playground' },
]

export function DbSelector({
  value,
  onChange,
  builtIn = DEFAULT_BUILTIN,
}: DbSelectorProps): React.ReactNode {
  const { t } = useTranslation()
  const { databases } = useUserDatabases()
  const selectId = useId()

  const options = useMemo(() => {
    const seen = new Set<string>()
    const out: Array<{ value: string; label: string; group: string }> = []
    for (const b of builtIn) {
      const k = `b:${String(b.value)}`
      if (seen.has(k)) continue
      seen.add(k)
      out.push({ value: k, label: b.label, group: 'built-in' })
    }
    for (const db of databases) {
      const numeric = /^db-(\d+)$/.exec(db.id)
      if (!numeric || !numeric[1]) continue
      const k = `db:${numeric[1]}`
      if (seen.has(k)) continue
      seen.add(k)
      out.push({ value: k, label: db.name, group: 'user' })
    }
    return out
  }, [builtIn, databases])

  const currentValue = value === null ? 'b:null' : `db:${value}`

  return (
    <div className={styles.wrapper}>
      <DatabaseIcon size={14} aria-hidden="true" className={styles.icon} />
      <label htmlFor={selectId} className={styles.label}>
        {t('playground.dbSelector.label')}
      </label>
      <select
        id={selectId}
        className={styles.select}
        value={currentValue}
        onChange={(e) => {
          const v = e.target.value
          if (v.startsWith('b:')) {
            onChange(null)
            return
          }
          const numeric = v.slice('db:'.length)
          const parsed = Number.parseInt(numeric, 10)
          onChange(Number.isFinite(parsed) ? parsed : null)
        }}
        data-testid="playground-db-selector"
        aria-label={t('playground.dbSelector.label')}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.group === 'built-in' ? `★ ${opt.label}` : opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export default DbSelector
