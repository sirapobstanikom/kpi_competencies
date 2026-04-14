import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AuthProvider } from './context/AuthContext'
import { AppShell } from './components/AppShell'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AdminRoute } from './components/AdminRoute'
import { LoginPage } from './pages/LoginPage'
import { HomePage } from './pages/HomePage'
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage'
import { DepartmentDashboardPage } from './pages/admin/DepartmentDashboardPage'
import { AssignmentPage } from './pages/admin/AssignmentPage'
import { MasterDataPage } from './pages/admin/MasterDataPage'
import { EmployeeDetailPage } from './pages/admin/EmployeeDetailPage'
import { EvaluatorDashboardPage } from './pages/evaluator/EvaluatorDashboardPage'
import { EvaluationFormPage } from './pages/evaluator/EvaluationFormPage'
import { EmployeeDashboardPage } from './pages/employee/EmployeeDashboardPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster richColors position="top-center" />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route index element={<HomePage />} />
              <Route path="me" element={<EmployeeDashboardPage />} />
              <Route path="evaluator" element={<EvaluatorDashboardPage />} />
              <Route path="evaluator/:evaluationId" element={<EvaluationFormPage />} />
              <Route path="admin" element={<AdminRoute />}>
                <Route index element={<AdminDashboardPage />} />
                <Route path="departments" element={<DepartmentDashboardPage />} />
                <Route path="assignments" element={<AssignmentPage />} />
                <Route path="master" element={<MasterDataPage />} />
                <Route path="employees/:employeeId" element={<EmployeeDetailPage />} />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
