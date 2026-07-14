import { Routes, Route, Navigate } from 'react-router-dom'
import RequireAuth from './components/auth/RequireAuth.jsx'
import RequireRole from './components/auth/RequireRole.jsx'
import { useAuth } from './context/AuthContext.jsx'
import Welcome from './pages/Welcome.jsx'
import SignIn from './pages/SignIn.jsx'
import ResetPassword from './pages/ResetPassword.jsx'
import PhoneVerify from './pages/onboarding/PhoneVerify.jsx'
import ChooseRole from './pages/ChooseRole.jsx'
import SenderHome from './pages/sender/SenderHome.jsx'
import NewRequest from './pages/sender/NewRequest.jsx'
import EditRequest from './pages/sender/EditRequest.jsx'
import RequestDetail from './pages/sender/RequestDetail.jsx'
import CourierHome from './pages/courier/CourierHome.jsx'
import CourierVerify from './pages/courier/CourierVerify.jsx'
import CourierDelivery from './pages/courier/CourierDelivery.jsx'
import RequireAdmin from './components/auth/RequireAdmin.jsx'
import AdminVerifications from './pages/admin/AdminVerifications.jsx'
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
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/verify-phone" element={<RequireAuth><PhoneVerify /></RequireAuth>} />
      <Route path="/choose-role" element={<RequireAuth><ChooseRole /></RequireAuth>} />
      <Route path="/" element={<RequireAuth><RootRedirect /></RequireAuth>} />
      <Route path="/sender" element={<RequireAuth><RequireRole role="sender"><SenderHome /></RequireRole></RequireAuth>} />
      <Route path="/sender/new" element={<RequireAuth><RequireRole role="sender"><NewRequest /></RequireRole></RequireAuth>} />
      <Route path="/sender/requests/:id/edit" element={<RequireAuth><RequireRole role="sender"><EditRequest /></RequireRole></RequireAuth>} />
      <Route path="/sender/requests/:id" element={<RequireAuth><RequireRole role="sender"><RequestDetail /></RequireRole></RequireAuth>} />
      <Route path="/courier" element={<RequireAuth><RequireRole role="courier"><CourierHome /></RequireRole></RequireAuth>} />
      <Route path="/courier/verify" element={<RequireAuth><RequireRole role="courier"><CourierVerify /></RequireRole></RequireAuth>} />
      <Route path="/courier/deliveries/:id" element={<RequireAuth><RequireRole role="courier"><CourierDelivery /></RequireRole></RequireAuth>} />
      <Route path="/admin" element={<RequireAuth><RequireAdmin><AdminVerifications /></RequireAdmin></RequireAuth>} />
      <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
    </Routes>
  )
}
