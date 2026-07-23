import { HashRouter, Route, Routes } from 'react-router-dom'
import { isSupabaseConfigured } from './lib/supabaseClient'
import { AuthProvider } from './features/auth/AuthContext'
import { RequireAuth } from './features/auth/RequireAuth'
import { LoginPage } from './features/auth/LoginPage'
import { Layout } from './components/Layout'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { MyTrainingPage } from './features/training/MyTrainingPage'
import { TeamTrainingPage } from './features/training/TeamTrainingPage'
import { EmployeeTrainingPage } from './features/training/EmployeeTrainingPage'
import { TemplateEditorPage } from './features/training/TemplateEditorPage'
import { RosterPage } from './features/training/RosterPage'
import { PayrollPage } from './features/training/PayrollPage'
import { AvailabilityPage } from './features/scheduling/AvailabilityPage'
import { BookTrainingPage } from './features/scheduling/BookTrainingPage'
import { MySessionsPage } from './features/scheduling/MySessionsPage'
import { AccountPage } from './features/auth/AccountPage'

// HashRouter (URLs like /#/training) because GitHub Pages is a static host
// and cannot rewrite arbitrary paths to index.html. See DECISIONS.md.
export default function App() {
  if (!isSupabaseConfigured) {
    return <SetupNeeded />
  }

  return (
    <HashRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="training" element={<MyTrainingPage />} />
            <Route path="team" element={<TeamTrainingPage />} />
            <Route path="team/:employeeId" element={<EmployeeTrainingPage />} />
            <Route path="roster" element={<RosterPage />} />
            <Route path="payroll" element={<PayrollPage />} />
            <Route path="book" element={<BookTrainingPage />} />
            <Route path="sessions" element={<MySessionsPage />} />
            <Route path="availability" element={<AvailabilityPage />} />
            <Route path="template" element={<TemplateEditorPage />} />
            <Route path="account" element={<AccountPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </HashRouter>
  )
}

function SetupNeeded() {
  return (
    <div className="page-message">
      <div className="card" style={{ maxWidth: '32rem' }}>
        <h1>Setup needed</h1>
        <p>
          This app is not connected to Supabase yet. Copy <code>.env.example</code> to{' '}
          <code>.env.local</code>, fill in your Supabase project URL and anon key, then restart the
          dev server. See <code>SETUP.md</code> for the full walkthrough.
        </p>
      </div>
    </div>
  )
}
