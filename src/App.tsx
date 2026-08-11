/**
 * Top-level React component.
 *
 * For the MVP the entire routing tree is exposed via `AppRouter`
 * (see `src/router.tsx`). The AppShell is mounted by the root route
 * element so it stays mounted across page transitions.
 */

import { AppRouter } from './router'

function App(): React.ReactNode {
  return <AppRouter />
}

export default App
