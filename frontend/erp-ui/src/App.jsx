import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login.jsx'
import ChangePassword from './pages/ChangePassword.jsx'
import Dashboard from './pages/Dashboard.jsx'
import EmployeeList from './pages/EmployeeList.jsx'
import EmployeeProfile from './pages/EmployeeProfile.jsx'
import Departments from './pages/Departments.jsx'
import Shifts from './pages/Shifts.jsx'
import ShiftMapping from './pages/ShiftMapping.jsx'
import ShiftCalendar from './pages/ShiftCalendar.jsx'
import Leave from './pages/Leave.jsx'
import ApprovalsEmployees from './pages/ApprovalsEmployees.jsx'
import ApprovalsOvertime from './pages/ApprovalsOvertime.jsx'
import Attendance from './pages/Attendance.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import RequireRole from './components/RequireRole.jsx'
import AppShell from './components/AppShell.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/change-password" element={<ChangePassword />} />
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/employees" element={<EmployeeList />} />
          <Route path="/employees/new" element={<EmployeeProfile mode="add" />} />
          <Route path="/employees/:id" element={<EmployeeProfile mode="edit" />} />

          <Route element={<RequireRole roles={['Admin','SuperAdmin']} />}>
            <Route path="/approvals/employees" element={<ApprovalsEmployees />} />
            <Route path="/approvals/overtime" element={<ApprovalsOvertime />} />
          </Route>

          <Route element={<RequireRole roles={['HR','Admin','SuperAdmin']} />}>
            <Route path="/departments" element={<Departments />} />
            <Route path="/shifts" element={<Shifts />} />
            <Route path="/shift-mapping" element={<ShiftMapping />} />
            <Route path="/shift-calendar" element={<ShiftCalendar />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/leave" element={<Leave />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
