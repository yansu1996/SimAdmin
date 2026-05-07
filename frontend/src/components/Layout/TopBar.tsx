import { useEffect, useRef, useState } from 'react'
import {
  Alert,
  AppBar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  LinearProgress,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Snackbar,
  Stack,
  SvgIcon,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material'
import {
  Brightness4 as DarkModeIcon,
  Brightness7 as LightModeIcon,
  Menu as MenuIcon,
  MoreVert as MoreVertIcon,
  Refresh as RefreshIcon,
  Router as RouterIcon,
  Speed as SpeedIcon,
} from '@mui/icons-material'
import { useTheme } from '../../contexts/ThemeContext'
import { useRefreshInterval } from '../../contexts/RefreshContext'
import { api } from '../../api/current'
import type { BasebandRestartResponse, BasebandRestartStep } from '../../api/types'

const TOPBAR_TRANSITION = '300ms cubic-bezier(0.4, 0, 0.2, 1)'

interface TopBarProps {
  drawerWidth: number
  onMenuClick: () => void
  refreshInterval: number
  onRefreshIntervalChange: (interval: number) => void
}

function ServiceRestartIcon() {
  return (
    <SvgIcon viewBox="0 0 1024 1024" sx={{ fontSize: 18 }}>
      <path d="M512 10.24c-69.12-1.536-126.976 53.248-128.512 122.368S436.736 259.584 505.856 261.12h6.144c69.12-1.536 123.904-58.88 122.368-128.512-1.536-66.56-55.296-120.832-122.368-122.368zM229.888 135.68c-52.224 0-94.208 41.984-94.208 94.208s41.984 94.208 94.208 94.208S324.096 281.6 324.096 229.888 281.6 135.68 229.888 135.68zM73.216 449.536C38.4 449.536 10.24 477.184 10.24 512c0 34.816 28.16 62.464 62.464 62.464s62.464-28.16 62.464-62.464c0.512-34.816-27.648-62.464-61.952-62.464zM198.656 762.88c-34.816 0-62.464 28.16-62.464 62.464 0 34.816 28.16 62.464 62.464 62.464S261.12 860.16 261.12 825.344c0-34.304-28.16-62.464-62.464-62.464z m313.344 125.44c-34.816 0-62.464 28.16-62.464 62.464 0 34.816 28.16 62.464 62.464 62.464 34.816 0 62.464-28.16 62.464-62.464 0-34.304-27.648-62.464-62.464-62.464z m313.344-125.44c-34.816 0-62.464 28.16-62.464 62.464 0 34.816 28.16 62.464 62.464 62.464 34.816 0 62.464-28.16 62.464-62.464 0.512-34.304-27.648-62.464-62.464-62.464z m125.44-313.344c-34.816 0-62.464 28.16-62.464 62.464 0 34.816 28.16 62.464 62.464 62.464 34.816 0 62.464-28.16 62.464-62.464 0.512-34.816-27.648-62.464-62.464-62.464z m0-188.416c1.536-69.12-53.248-126.976-122.368-128.512-69.12-1.536-126.976 53.248-128.512 122.368V261.12c1.536 69.12 58.88 123.904 128.512 122.368 67.072-1.536 120.832-55.296 122.368-122.368z" fill="currentColor" />
    </SvgIcon>
  )
}

function DeviceRebootIcon() {
  return (
    <SvgIcon viewBox="0 0 1024 1024" sx={{ fontSize: 18 }}>
      <path d="M561.312102 68.191078l-98.624205 0 0 493.121024 98.624205 0L561.312102 68.191078zM799.735283 174.951591l-69.77618 69.77618c77.420277 63.36619 127.225613 159.27761 127.225613 267.271206 0 190.590779-154.592914 345.184717-345.184717 345.184717S166.815283 702.590779 166.815283 512c0-107.993596 49.805336-203.905016 127.225613-267.271206l-69.77618-69.77618C129.0911 256.316713 68.191078 376.884696 68.191078 512c0 245.080811 198.72811 443.808922 443.808922 443.808922s443.808922-198.72811 443.808922-443.808922C955.808922 376.884696 894.907876 256.316713 799.735283 174.951591z" fill="#d81e06" />
    </SvgIcon>
  )
}

export default function TopBar({
  drawerWidth,
  onMenuClick,
  refreshInterval,
  onRefreshIntervalChange,
}: TopBarProps) {
  const { mode, toggleTheme } = useTheme()
  const { triggerRefresh } = useRefreshInterval()
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const [refreshMenuAnchor, setRefreshMenuAnchor] = useState<null | HTMLElement>(null)
  const [basebandRestarting, setBasebandRestarting] = useState(false)
  const [basebandProgressOpen, setBasebandProgressOpen] = useState(false)
  const [basebandSteps, setBasebandSteps] = useState<BasebandRestartStep[]>([])
  const [basebandCurrentRegistration, setBasebandCurrentRegistration] = useState<string | null>(null)
  const [systemActionLoading, setSystemActionLoading] = useState<'service' | 'device' | null>(null)
  const [systemActionMessage, setSystemActionMessage] = useState<string | null>(null)
  const [systemActionSeverity, setSystemActionSeverity] = useState<'info' | 'success' | 'error'>('info')
  const [deviceRebootProgressOpen, setDeviceRebootProgressOpen] = useState(false)
  const [deviceRebootSteps, setDeviceRebootSteps] = useState<BasebandRestartStep[]>([])
  const deviceRebootTimersRef = useRef<number[]>([])
  const title = drawerWidth <= 80 ? 'SimAdmin - SIM/eSIM 中枢' : 'SIM/eSIM 中枢'

  useEffect(() => {
    return () => {
      deviceRebootTimersRef.current.forEach((timer) => window.clearTimeout(timer))
      deviceRebootTimersRef.current = []
    }
  }, [])

  const applyBasebandProgress = (data?: BasebandRestartResponse) => {
    if (!data) return
    setBasebandSteps(data.steps ?? [])
    setBasebandCurrentRegistration(data.current_registration ?? null)
  }

  const loadBasebandProgress = async () => {
    const response = await api.getBasebandRestartStatus()
    applyBasebandProgress(response.data)
  }

  const getBasebandStatusColor = (status: string): 'default' | 'success' | 'error' | 'warning' | 'info' => {
    if (status === 'ok') return 'success'
    if (status === 'error') return 'error'
    if (status === 'warning') return 'warning'
    if (status === 'skipped') return 'default'
    return 'info'
  }

  const getBasebandStatusLabel = (status: string) => {
    if (status === 'ok') return '完成'
    if (status === 'error') return '失败'
    if (status === 'warning') return '警告'
    if (status === 'skipped') return '跳过'
    if (status === 'running') return '进行中'
    return status
  }

  const handleRestartBaseband = async () => {
    if (basebandRestarting) return
    setBasebandRestarting(true)
    setBasebandProgressOpen(true)
    setBasebandSteps([])
    setBasebandCurrentRegistration(null)
    let progressTimer: number | undefined
    try {
      progressTimer = window.setInterval(() => void loadBasebandProgress(), 1000)
      const response = await api.restartBaseband()
      applyBasebandProgress(response.data)
      triggerRefresh()
    } catch (err) {
      await loadBasebandProgress().catch(() => undefined)
      setBasebandSteps((steps) => {
        if (steps.some((step) => step.status === 'error')) return steps
        return [...steps, { step: '重启基带失败', status: 'error', detail: err instanceof Error ? err.message : '未知错误' }]
      })
    } finally {
      if (progressTimer) window.clearInterval(progressTimer)
      await loadBasebandProgress().catch(() => undefined)
      setBasebandRestarting(false)
    }
  }

  const handleRestartService = async () => {
    if (systemActionLoading) return
    setSystemActionLoading('service')
    setSystemActionSeverity('info')
    setSystemActionMessage('正在重启 SimAdmin 服务')
    try {
      await api.restartService()
      setSystemActionSeverity('success')
      setSystemActionMessage('SimAdmin 服务正在重启')
    } catch (err) {
      setSystemActionSeverity('error')
      setSystemActionMessage(err instanceof Error ? err.message : '重启服务失败')
    } finally {
      setSystemActionLoading(null)
    }
  }

  const handleRebootDevice = async () => {
    if (systemActionLoading) return
    setSystemActionLoading('device')
    setDeviceRebootProgressOpen(true)
    setDeviceRebootSteps([
      { step: '提交安全重启请求', status: 'running', detail: '等待后端接管重启序列' },
      { step: '关闭射频模块', status: 'running', detail: 'mmcli -m 0 -d' },
      { step: '停止 ModemManager', status: 'running', detail: '切断 D-Bus / QMI 通信链路' },
      { step: '停止 qmi-proxy', status: 'running', detail: '释放底层 QMI 代理进程' },
      { step: '清理 ModemManager 缓存', status: 'running', detail: '删除 /var/lib/ModemManager 残留状态' },
      { step: '同步文件系统缓存', status: 'running', detail: 'sync 后等待硬件稳定' },
      { step: '执行系统重启', status: 'running', detail: '设备即将离线' },
    ])
    deviceRebootTimersRef.current.forEach((timer) => window.clearTimeout(timer))
    deviceRebootTimersRef.current = []
    try {
      await api.rebootSystem(1)
      const scheduleStep = (index: number, status: BasebandRestartStep['status'], detail: string, delay = 0) => {
        const timer = window.setTimeout(() => {
          setDeviceRebootSteps((steps) =>
            steps.map((step, stepIndex) => stepIndex === index ? { ...step, status, detail } : step),
          )
        }, delay)
        deviceRebootTimersRef.current.push(timer)
      }
      scheduleStep(0, 'ok', '后端已开始 Safe OS Reboot', 0)
      scheduleStep(1, 'ok', '射频已请求进入低功耗休眠状态', 1000)
      scheduleStep(2, 'ok', 'ModemManager 停止命令已下发', 1600)
      scheduleStep(3, 'ok', 'qmi-proxy 清理命令已下发', 2200)
      scheduleStep(4, 'ok', '运行状态缓存清理命令已执行', 2800)
      scheduleStep(5, 'ok', '缓存同步并等待 2 秒', 3400)
      scheduleStep(6, 'ok', 'reboot 命令已下发，页面连接将中断，请等待设备重启。', 4800)
      const doneTimer = window.setTimeout(() => setSystemActionLoading(null), 5600)
      deviceRebootTimersRef.current.push(doneTimer)
    } catch (err) {
      setDeviceRebootSteps((steps) =>
        steps.map((step, index) => index === 0 ? { ...step, status: 'error', detail: err instanceof Error ? err.message : '重启设备失败' } : step),
      )
      setSystemActionLoading(null)
    }
  }

  const handleRefreshIntervalChange = (interval: number) => {
    onRefreshIntervalChange(interval)
    setRefreshMenuAnchor(null)
  }

  const getRefreshLabel = () => {
    if (refreshInterval === 0) return '手动'
    return `${refreshInterval / 1000}秒`
  }

  return (
    <AppBar
      position="static"
      sx={{
        color: 'text.primary',
        bgcolor: 'transparent',
        borderBottom: 0,
        backdropFilter: 'none',
        WebkitBackdropFilter: 'none',
        flexShrink: 0,
        transition: `width ${TOPBAR_TRANSITION}`,
        willChange: 'width',
      }}
    >
      <Toolbar sx={{ minHeight: { xs: 56, sm: 56 }, px: { xs: 1.5, sm: 2 } }}>
        <IconButton
          color="default"
          aria-label="切换侧边栏"
          edge="start"
          onClick={onMenuClick}
          sx={{
            mr: 1.5,
            color: 'text.primary',
            border: '1px solid transparent',
            bgcolor: 'transparent',
            '&:hover': {
              borderColor: 'divider',
              bgcolor: (theme) => theme.palette.mode === 'light' ? 'rgba(255,255,255,0.62)' : 'rgba(30,41,59,0.82)',
            },
          }}
        >
          <MenuIcon />
        </IconButton>

        <Typography
          variant="h6"
          noWrap
          component="div"
          sx={{ flexGrow: 1, fontSize: { xs: '1rem', sm: '1.05rem' }, fontWeight: 700, letterSpacing: 0 }}
        >
          {title}
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 1 } }}>
          <Tooltip title="刷新页面">
            <IconButton color="default" onClick={triggerRefresh}>
              <RefreshIcon sx={{ fontSize: 22 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="重启基带">
            <span>
              <IconButton size="small" color="default" onClick={() => void handleRestartBaseband()} disabled={basebandRestarting || systemActionLoading !== null} sx={{ p: 0.75 }}>
                {basebandRestarting ? <CircularProgress size={18} color="inherit" /> : <RouterIcon sx={{ fontSize: 18 }} />}
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="重启服务">
            <span>
              <IconButton size="small" color="default" onClick={() => void handleRestartService()} disabled={basebandRestarting || systemActionLoading !== null} sx={{ p: 0.75 }}>
                {systemActionLoading === 'service' ? <CircularProgress size={18} color="inherit" /> : <ServiceRestartIcon />}
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="重启设备">
            <span>
              <IconButton size="small" color="default" onClick={() => void handleRebootDevice()} disabled={basebandRestarting || systemActionLoading !== null} sx={{ p: 0.75 }}>
                {systemActionLoading === 'device' ? <CircularProgress size={18} color="inherit" /> : <DeviceRebootIcon />}
              </IconButton>
            </span>
          </Tooltip>
          <IconButton color="default" onClick={(event) => setAnchorEl(event.currentTarget)} title="更多选项">
            <MoreVertIcon />
          </IconButton>
        </Box>

        <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)} PaperProps={{ sx: { minWidth: 200, mt: 1 } }}>
          <MenuItem
            onClick={() => {
              toggleTheme()
              setAnchorEl(null)
            }}
          >
            <ListItemIcon>
              {mode === 'dark' ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
            </ListItemIcon>
            <ListItemText>{mode === 'dark' ? '浅色模式' : '深色模式'}</ListItemText>
          </MenuItem>
          <Divider />
          <MenuItem onClick={(event) => setRefreshMenuAnchor(event.currentTarget)}>
            <ListItemIcon><SpeedIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="刷新频率" secondary={getRefreshLabel()} secondaryTypographyProps={{ variant: 'caption' }} />
          </MenuItem>
        </Menu>

        <Menu anchorEl={refreshMenuAnchor} open={Boolean(refreshMenuAnchor)} onClose={() => setRefreshMenuAnchor(null)}>
          {[1000, 3000, 5000, 10000].map((interval) => (
            <MenuItem key={interval} selected={refreshInterval === interval} onClick={() => handleRefreshIntervalChange(interval)}>
              {interval / 1000}秒/次
            </MenuItem>
          ))}
          <Divider />
          <MenuItem selected={refreshInterval === 0} onClick={() => handleRefreshIntervalChange(0)}>
            手动刷新
          </MenuItem>
        </Menu>

        <Dialog open={basebandProgressOpen} onClose={() => { if (!basebandRestarting) setBasebandProgressOpen(false) }} maxWidth="sm" fullWidth>
          <DialogTitle>重启基带</DialogTitle>
          <DialogContent dividers>
            {basebandRestarting && <LinearProgress sx={{ mb: 2 }} />}
            {basebandCurrentRegistration && <Alert severity="info" sx={{ mb: 2 }}>当前注册状态：{basebandCurrentRegistration}</Alert>}
            <Stack spacing={1}>
              {basebandSteps.length === 0 ? (
                <Typography variant="body2" color="text.secondary">等待后端开始记录步骤...</Typography>
              ) : (
                basebandSteps.map((step, index) => (
                  <Box key={`${step.step}-${index}`} sx={{ display: 'grid', gridTemplateColumns: '76px minmax(0, 1fr)', gap: 1.5, alignItems: 'start', borderBottom: '1px solid', borderColor: 'divider', pb: 1 }}>
                    <Chip size="small" label={getBasebandStatusLabel(step.status)} color={getBasebandStatusColor(step.status)} sx={{ width: 68 }} />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{step.step}</Typography>
                      {step.detail && <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-word' }}>{step.detail}</Typography>}
                    </Box>
                  </Box>
                ))
              )}
            </Stack>
          </DialogContent>
          <DialogActions><Button disabled={basebandRestarting} onClick={() => setBasebandProgressOpen(false)}>关闭</Button></DialogActions>
        </Dialog>

        <Dialog open={deviceRebootProgressOpen} onClose={() => { if (systemActionLoading !== 'device') setDeviceRebootProgressOpen(false) }} maxWidth="sm" fullWidth>
          <DialogTitle>重启设备</DialogTitle>
          <DialogContent dividers>
            {systemActionLoading === 'device' && <LinearProgress sx={{ mb: 2 }} />}
            <Alert severity="info" sx={{ mb: 2 }}>正在执行 Safe OS Reboot，网络连接会在最后一步中断。</Alert>
            <Stack spacing={1}>
              {deviceRebootSteps.map((step, index) => (
                <Box key={`${step.step}-${index}`} sx={{ display: 'grid', gridTemplateColumns: '76px minmax(0, 1fr)', gap: 1.5, alignItems: 'start', borderBottom: '1px solid', borderColor: 'divider', pb: 1 }}>
                  <Chip size="small" label={getBasebandStatusLabel(step.status)} color={getBasebandStatusColor(step.status)} sx={{ width: 68 }} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{step.step}</Typography>
                    {step.detail && <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-word' }}>{step.detail}</Typography>}
                  </Box>
                </Box>
              ))}
            </Stack>
          </DialogContent>
          <DialogActions><Button disabled={systemActionLoading === 'device'} onClick={() => setDeviceRebootProgressOpen(false)}>关闭</Button></DialogActions>
        </Dialog>

        <Snackbar
          open={!!systemActionMessage}
          autoHideDuration={systemActionLoading ? null : 3000}
          resumeHideDuration={3000}
          onClose={() => { if (!systemActionLoading) setSystemActionMessage(null) }}
          anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
          sx={{ top: { xs: 72, sm: 80 } }}
        >
          <Alert
            severity={systemActionSeverity}
            variant="filled"
            icon={systemActionLoading ? <CircularProgress size={18} color="inherit" /> : undefined}
            onClose={systemActionLoading ? undefined : () => setSystemActionMessage(null)}
          >
            {systemActionMessage}
          </Alert>
        </Snackbar>
      </Toolbar>
    </AppBar>
  )
}
