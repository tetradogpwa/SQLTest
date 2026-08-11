/**
 * Top-level application shell.
 *
 * Layout:
 *   ┌─────────────────────────── <TopBar /> ─────────────────────────┐
 *   │  <Sidebar rail />         │            <main>                  │
 *   │  (collapsible)            │              {children}            │
 *   │                           │            </main>                 │
 *   └────────────────────────────────────────────────────────────────┘
 *
 * On mobile the rail becomes hidden and a slide-over drawer is
 * rendered in addition. The drawer is controlled by a `mobileOpen`
 * state, which is flipped by the TopBar's hamburger button.
 *
 * The `data-theme` attribute is applied by `<ThemeProvider>` (mounted
 * in `main.tsx`). This component only provides the structural layout
 * and the responsive sidebar toggle.
 */

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { TopBar } from './TopBar'
import { Sidebar } from './Sidebar'
import { useTranslation } from '../../../core/i18n/i18n'
import styles from './shell.module.css'

export interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps): React.ReactNode {
  const { t } = useTranslation()
  const [mobileOpen, setMobileOpen] = useState<boolean>(false)

  // Close the mobile drawer on browser back/forward.
  useEffect(() => {
    const handlePop = (): void => setMobileOpen(false)
    window.addEventListener('popstate', handlePop)
    return () => window.removeEventListener('popstate', handlePop)
  }, [])

  return (
    <div className={styles.app}>
      <TopBar
        onToggleSidebar={() => setMobileOpen((v) => !v)}
        sidebarToggleLabel={t('nav.toggleSidebar')}
      />

      <div className={styles.appBody}>
        <Sidebar variant="rail" />

        {/* Mobile drawer — slides over the page when `mobileOpen` is true. */}
        <Sidebar
          variant="drawer"
          mobileOpen={mobileOpen}
          onRequestClose={() => setMobileOpen(false)}
        />

        <main className={styles.appMain} id="main-content">
          {children}
        </main>
      </div>
    </div>
  )
}
