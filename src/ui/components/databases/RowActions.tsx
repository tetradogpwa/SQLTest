/**
 * RowActions — kebab menu shown at the end of each database row.
 *
 * The menu exposes four actions (open in playground, rename, export,
 * delete). The parent owns the action implementations; this component
 * is just the menu UI.
 *
 * The menu is rendered as a small popover that opens on click and
 * closes on outside click / Escape. A button-level `aria-haspopup` /
 * `aria-expanded` keeps screen readers happy.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Database,
  Download,
  Edit2,
  MoreVertical,
  PlayCircle,
  Trash2,
} from 'lucide-react'

import { useTranslation } from '../../../core/i18n/i18n'
import type { Database as DatabaseRow } from '../../../core/persistence'
import styles from './RowActions.module.css'

export interface RowActionsProps {
  database: DatabaseRow
  onOpen: (database: DatabaseRow) => void
  onRename: (database: DatabaseRow) => void
  onExport: (database: DatabaseRow) => void
  onDelete: (database: DatabaseRow) => void
}

interface ActionDescriptor {
  id: 'open' | 'rename' | 'export' | 'delete'
  icon: React.ComponentType<{ size?: number }>
  labelKey: string
  tone: 'default' | 'danger'
  testId: string
}

const ACTIONS: ReadonlyArray<ActionDescriptor> = [
  {
    id: 'open',
    icon: PlayCircle,
    labelKey: 'databases.rowActions.open',
    tone: 'default',
    testId: 'row-action-open',
  },
  {
    id: 'rename',
    icon: Edit2,
    labelKey: 'databases.rowActions.rename',
    tone: 'default',
    testId: 'row-action-rename',
  },
  {
    id: 'export',
    icon: Download,
    labelKey: 'databases.rowActions.export',
    tone: 'default',
    testId: 'row-action-export',
  },
  {
    id: 'delete',
    icon: Trash2,
    labelKey: 'databases.rowActions.delete',
    tone: 'danger',
    testId: 'row-action-delete',
  },
]

export function RowActions({
  database,
  onOpen,
  onRename,
  onExport,
  onDelete,
}: RowActionsProps): React.ReactNode {
  const { t } = useTranslation()
  const [open, setOpen] = useState<boolean>(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return undefined
    const onClick = (e: MouseEvent): void => {
      if (!containerRef.current) return
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const handle = useCallback(
    (id: ActionDescriptor['id']) => {
      setOpen(false)
      switch (id) {
        case 'open':
          onOpen(database)
          return
        case 'rename':
          onRename(database)
          return
        case 'export':
          onExport(database)
          return
        case 'delete':
          onDelete(database)
          return
        default:
          return
      }
    },
    [database, onOpen, onRename, onExport, onDelete],
  )

  return (
    <div className={styles.container} ref={containerRef}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('databases.rowActions.ariaLabel')}
        data-testid={`row-actions-trigger-${database.id}`}
      >
        <MoreVertical size={16} aria-hidden="true" />
      </button>
      {open ? (
        <ul
          className={styles.menu}
          role="menu"
          aria-label={t('databases.rowActions.ariaLabel')}
          data-testid={`row-actions-menu-${database.id}`}
        >
          <li className={styles.menuHeader} aria-hidden="true">
            <Database size={12} aria-hidden="true" /> {database.name}
          </li>
          {ACTIONS.map((action) => {
            const Icon = action.icon
            return (
              <li key={action.id} role="none">
                <button
                  type="button"
                  role="menuitem"
                  className={
                    action.tone === 'danger' ? styles.menuItemDanger : styles.menuItem
                  }
                  onClick={() => handle(action.id)}
                  data-testid={`${action.testId}-${database.id}`}
                >
                  <Icon size={14} aria-hidden="true" />
                  <span>{t(action.labelKey)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}

export default RowActions
