import { Routes, Route, Navigate } from 'react-router-dom'
import RequireAuth from './components/auth/RequireAuth.jsx'
import RequireRole from './components/auth/RequireRole.jsx'
import { useAuth } from './context/AuthContext.jsx'
import Welcome from './pages/Welcome.jsx'
import SignIn from './pages/SignIn.jsx'
import ChooseRole from './pages/ChooseRole.jsx'
import SenderHome from './pages/sender/SenderHome.jsx'
import NewRequest from './pages/sender/NewRequest.jsx'
import CourierHome from './pages/courier/CourierHome.jsx'
import Settings from './pages/Settings.jsx'

function RootRedirect() {
  const { profile } = useAuth()
  if (profile?.account_type === 'sender') return <Navigate to="/sender" replace />
  if (profile?.account_type === 'courier') return <Navigate to="/courier" replace />
  return <Navigate to="/choose-role" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/welcome" element={<Welcome />} />
      <Route path="/signin" element={<SignIn />} />
      <Route path="/choose-role" element={<RequireAuth><ChooseRole /></RequireAuth>} />
      <Route path="/" element={<RequireAuth><RootRedirect /></RequireAuth>} />
      <Route path="/sender" element={<RequireAuth><RequireRole role="sender"><SenderHome /></RequireRole></RequireAuth>} />
      <Route path="/sender/new" element={<RequireAuth><RequireRole role="sender"><NewRequest /></RequireRole></RequireAuth>} />
      <Route path="/courier" element={<RequireAuth><RequireRole role="courier"><CourierHome /></RequireRole></RequireAuth>} />
      <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
    </Routes>
  )
}
