import { Routes, Route, Navigate } from 'react-router-dom'
import RequireAuth from './components/auth/RequireAuth.jsx'
import RequireRole from './components/auth/RequireRole.jsx'
import SenderLayout from './components/SenderLayout.jsx'
import CourierLayout from './components/CourierLayout.jsx'
import { useAuth } from './context/AuthContext.jsx'
import Welcome from './pages/Welcome.jsx'
import SignIn from './pages/SignIn.jsx'
import SignUp from './pages/SignUp.jsx'
import ResetPassword from './pages/ResetPassword.jsx'
import PhoneVerify from './pages/onboarding/PhoneVerify.jsx'
import NameCapture from './pages/onboarding/NameCapture.jsx'
import ChooseRole from './pages/ChooseRole.jsx'
import SenderHome from './pages/sender/SenderHome.jsx'
import SenderInbox from './pages/sender/SenderInbox.jsx'
import SenderProfile from './pages/sender/SenderProfile.jsx'
import NewRequest from './pages/sender/NewRequest.jsx'
import EditRequest from './pages/sender/EditRequest.jsx'
import RequestDetail from './pages/sender/RequestDetail.jsx'
import CourierHome from './pages/courier/CourierHome.jsx'
import CourierInbox from './pages/courier/CourierInbox.jsx'
import CourierProfile from './pages/courier/CourierProfile.jsx'
import CourierVerify from './pages/courier/CourierVerify.jsx'
import CourierDelivery from './pages/courier/CourierDelivery.jsx'
import RequireAdmin from './components/auth/RequireAdmin.jsx'
import AdminVerifications from './pages/admin/AdminVerifications.jsx'

function RootRedirect() {
  const { profile } = useAuth()
  if (profile?.account_type === 'sender') return <Navigate to="/sender" replace />
  if (profile?.account_type === 'courier') return <Navigate to="/courier" replace />
  return <Navigate to="/choose-role" replace />
}

function RoleRoute({ role, children }) {
  const Layout = role === 'courier' ? CourierLayout : SenderLayout
  return (
    <RequireAuth>
      <RequireRole role={role}>
        <Layout>{children}</Layout>
      </RequireRole>
    </RequireAuth>
  )
}

function SenderRoute({ children }) {
  return <RoleRoute role="sender">{children}</RoleRoute>
}

function CourierRoute({ children }) {
  return <RoleRoute role="courier">{children}</RoleRoute>
}

export default function App() {
  return (
    <Routes>
      <Route path="/welcome" element={<Welcome />} />
      <Route path="/signin" element={<SignIn />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/verify-phone" element={<RequireAuth><PhoneVerify /></RequireAuth>} />
      <Route path="/name" element={<RequireAuth><NameCapture /></RequireAuth>} />
      <Route path="/choose-role" element={<RequireAuth><ChooseRole /></RequireAuth>} />
      <Route path="/" element={<RequireAuth><RootRedirect /></RequireAuth>} />
      <Route path="/sender" element={<SenderRoute><SenderHome /></SenderRoute>} />
      <Route path="/sender/inbox" element={<SenderRoute><SenderInbox /></SenderRoute>} />
      <Route path="/sender/profile" element={<SenderRoute><SenderProfile /></SenderRoute>} />
      <Route path="/sender/new" element={<SenderRoute><NewRequest /></SenderRoute>} />
      <Route path="/sender/requests/:id/edit" element={<SenderRoute><EditRequest /></SenderRoute>} />
      <Route path="/sender/requests/:id" element={<SenderRoute><RequestDetail /></SenderRoute>} />
      <Route path="/courier" element={<CourierRoute><CourierHome /></CourierRoute>} />
      <Route path="/courier/inbox" element={<CourierRoute><CourierInbox /></CourierRoute>} />
      <Route path="/courier/profile" element={<CourierRoute><CourierProfile /></CourierRoute>} />
      <Route path="/courier/verify" element={<CourierRoute><CourierVerify /></CourierRoute>} />
      <Route path="/courier/deliveries/:id" element={<CourierRoute><CourierDelivery /></CourierRoute>} />
      <Route path="/admin" element={<RequireAuth><RequireAdmin><AdminVerifications /></RequireAdmin></RequireAuth>} />
    </Routes>
  )
}
