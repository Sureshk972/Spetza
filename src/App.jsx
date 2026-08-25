import { useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { onBackButton } from './lib/capacitor.js'
import TestModeBar from './components/TestModeBar.jsx'
import RequireAuth from './components/auth/RequireAuth.jsx'
import RequireRole from './components/auth/RequireRole.jsx'
import SenderLayout from './components/SenderLayout.jsx'
import CourierLayout from './components/CourierLayout.jsx'
import AdminLayout from './layouts/AdminLayout.jsx'
import { useAuth } from './context/AuthContext.jsx'
import Welcome from './pages/Welcome.jsx'
import SignIn from './pages/SignIn.jsx'
import SignUp from './pages/SignUp.jsx'
import Trust from './pages/Trust.jsx'
import Privacy from './pages/Privacy.jsx'
import Terms from './pages/Terms.jsx'
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
import AdminDashboard from './pages/admin/AdminDashboard.jsx'
import AdminUsers from './pages/admin/AdminUsers.jsx'
import AdminUserDetail from './pages/admin/AdminUserDetail.jsx'
import AdminDeliveries from './pages/admin/AdminDeliveries.jsx'
import AdminDeliveryDetail from './pages/admin/AdminDeliveryDetail.jsx'
import AdminPayments from './pages/admin/AdminPayments.jsx'
import AdminVerifications from './pages/admin/AdminVerifications.jsx'
import AdminRatings from './pages/admin/AdminRatings.jsx'
import AdminDemandMap from './pages/admin/AdminDemandMap.jsx'

function RootRedirect() {
  const { profile } = useAuth()
  // Role before admin. Admins are users too -- and in practice the admin is
  // also the person testing sender and courier flows, so sending them to the
  // panel from '/' made the app unreachable without typing a URL. A role-less
  // admin still lands in the panel rather than being asked to pick a role.
  if (profile?.account_type === 'sender') return <Navigate to="/sender" replace />
  if (profile?.account_type === 'courier') return <Navigate to="/courier" replace />
  if (profile?.is_admin) return <Navigate to="/admin" replace />
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
  const navigate = useNavigate()

  useEffect(() => {
    const cleanup = onBackButton(({ canGoBack }) => {
      if (canGoBack) {
        navigate(-1)
      }
    })
    return cleanup
  }, [navigate])

  return (
    <>
    <TestModeBar />
    <Routes>
      <Route path="/welcome" element={<Welcome />} />
      <Route path="/signin" element={<SignIn />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/trust" element={<Trust />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
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

      {/* Admin */}
      <Route path="/admin" element={<RequireAuth><RequireAdmin><AdminLayout /></RequireAdmin></RequireAuth>}>
        <Route index element={<AdminDashboard />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="users/:id" element={<AdminUserDetail />} />
        <Route path="deliveries" element={<AdminDeliveries />} />
        <Route path="deliveries/:id" element={<AdminDeliveryDetail />} />
        <Route path="payments" element={<AdminPayments />} />
        <Route path="verifications" element={<AdminVerifications />} />
        <Route path="ratings" element={<AdminRatings />} />
        <Route path="demand" element={<AdminDemandMap />} />
      </Route>

      {/* Unknown URL: bounce to the root, which routes signed-in users to
          their role home and everyone else to /welcome. Prevents a typo'd
          or stale link rendering a blank page. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  )
}
