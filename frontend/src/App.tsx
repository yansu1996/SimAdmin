import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { Box, CircularProgress } from '@mui/material'
import { ThemeProvider } from './contexts/ThemeContext'
import { WorkModeProvider, useWorkMode } from './contexts/WorkModeContext'
import { queryClient } from './lib/queryClient'
import MainLayout from './components/Layout/MainLayout'
import { api } from './api/current'

// 路由级别代码分割 - 按需加载页面组件
const Dashboard = lazy(() => import('./pages/Dashboard'))
const DeviceInfo = lazy(() => import('./pages/DeviceInfo'))
const Network = lazy(() => import('./pages/Network'))
const DeviceNetwork = lazy(() => import('./pages/DeviceNetwork'))
const SMS = lazy(() => import('./pages/SMS'))
const NotificationCenter = lazy(() => import('./pages/NotificationCenter'))
const Phone = lazy(() => import('./pages/Phone'))
const Configuration = lazy(() => import('./pages/Configuration'))
const OtaUpdate = lazy(() => import('./pages/OtaUpdate'))
const EsimManager = lazy(() => import('./pages/EsimManager'))
const Login = lazy(() => import('./pages/Login'))

// 页面加载中的 fallback
function PageLoading() {
  return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
      <CircularProgress size={32} />
    </Box>
  )
}

function EsimRoute() {
  const { mode, loading } = useWorkMode()
  if (loading) return <PageLoading />
  if (mode !== 'esim') return <Navigate to="/config" replace />
  return (
    <Suspense fallback={<PageLoading />}>
      <EsimManager />
    </Suspense>
  )
}

function ProtectedShell() {
  const location = useLocation()
  const [checking, setChecking] = useState(true)
  const [allowed, setAllowed] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.getAuthStatus()
      .then((response) => {
        if (!cancelled) setAllowed(response.data?.authenticated === true)
      })
      .catch(() => {
        if (!cancelled) setAllowed(false)
      })
      .finally(() => {
        if (!cancelled) setChecking(false)
      })
    return () => { cancelled = true }
  }, [])

  if (checking) return <PageLoading />
  if (!allowed) {
    const next = `${location.pathname}${location.search}`
    return <Navigate to={next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`} replace />
  }

  return (
    <WorkModeProvider>
      <MainLayout />
    </WorkModeProvider>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Suspense fallback={<PageLoading />}><Login /></Suspense>} />
            <Route path="/" element={<ProtectedShell />}>
              <Route index element={<Suspense fallback={<PageLoading />}><Dashboard /></Suspense>} />
              <Route path="device" element={<Suspense fallback={<PageLoading />}><DeviceInfo /></Suspense>} />
              <Route path="esim" element={<EsimRoute />} />
              <Route path="network" element={<Suspense fallback={<PageLoading />}><Network /></Suspense>} />
              <Route path="device-network" element={<Suspense fallback={<PageLoading />}><DeviceNetwork /></Suspense>} />
              {/* 旧路由重定向到网络状态页面 */}
              <Route path="network-interfaces" element={<Navigate to="/network" replace />} />
              <Route path="band-lock" element={<Navigate to="/network" replace />} />
              <Route path="sms" element={<Suspense fallback={<PageLoading />}><SMS /></Suspense>} />
              <Route path="notifications" element={<Suspense fallback={<PageLoading />}><NotificationCenter /></Suspense>} />
              <Route path="phone" element={<Suspense fallback={<PageLoading />}><Phone /></Suspense>} />
              <Route path="config" element={<Suspense fallback={<PageLoading />}><Configuration /></Suspense>} />
              <Route path="ota" element={<Suspense fallback={<PageLoading />}><OtaUpdate /></Suspense>} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

export default App
