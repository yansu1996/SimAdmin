import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  IconButton,
  InputBase,
  Link,
  LinearProgress,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material'
import {
  GitHub as GitHubIcon,
  KeyboardArrowRight as ArrowIcon,
  LockOutlined as LockIcon,
  Star as StarIcon,
} from '@mui/icons-material'
import { api } from '../api/current'
import communityQrUrl from '../../../static/Community/Community_QQ_Light.png'

type AuthMode = 'login' | 'setup'
type PasswordStrength = 'weak' | 'medium' | 'strong'

const PASSWORD_MAX_LENGTH = 64

function getNextPath(next: string | null) {
  if (!next || !next.startsWith('/') || next.startsWith('/login')) return '/'
  return next
}

function isAllowedPasswordChar(char: string) {
  return /^[\x21-\x7E]$/.test(char)
}

function normalizePasswordInput(value: string) {
  return Array.from(value)
    .filter(isAllowedPasswordChar)
    .join('')
    .slice(0, PASSWORD_MAX_LENGTH)
}

function getPasswordCategories(password: string) {
  return {
    lower: /[a-z]/.test(password),
    upper: /[A-Z]/.test(password),
    digit: /\d/.test(password),
    symbol: /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/.test(password),
  }
}

function analyzePassword(password: string) {
  const categories = getPasswordCategories(password)
  const categoryCount = Object.values(categories).filter(Boolean).length
  const lengthOk = password.length >= 8 && password.length <= PASSWORD_MAX_LENGTH
  const charsOk = password.length > 0 && password === normalizePasswordInput(password)
  const mixedOk = categoryCount >= 2
  let score = 0
  if (lengthOk) score += 1
  if (mixedOk) score += 1
  if (password.length >= 12) score += 1
  if (categoryCount >= 3) score += 1
  const strength: PasswordStrength = score >= 4 ? 'strong' : score >= 2 ? 'medium' : 'weak'

  return {
    categoryCount,
    lengthOk,
    charsOk,
    mixedOk,
    valid: lengthOk && charsOk && mixedOk,
    strength,
  }
}

function strengthLabel(strength: PasswordStrength) {
  if (strength === 'strong') return '强'
  if (strength === 'medium') return '中'
  return '弱'
}

function strengthColor(strength: PasswordStrength): 'error' | 'warning' | 'success' {
  if (strength === 'strong') return 'success'
  if (strength === 'medium') return 'warning'
  return 'error'
}

function PasswordStrengthHint({ password }: { password: string }) {
  if (!password) return null

  const analysis = analyzePassword(password)
  const progress = analysis.strength === 'strong' ? 100 : analysis.strength === 'medium' ? 62 : 28

  const rules = [
    { ok: analysis.lengthOk, label: '8-64 个字符' },
    { ok: analysis.charsOk, label: '仅限英文字母、数字和符号' },
    { ok: analysis.mixedOk, label: '至少包含两类字符' },
  ]

  return (
    <Stack
      spacing={1}
      sx={{
        ml: { xs: 1.5, sm: 2 },
        mr: 1,
        width: { xs: 'calc(100% - 20px)', sm: 'calc(100% - 24px)' },
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="caption" color="text.secondary">密码强度</Typography>
        <Chip
          size="small"
          color={strengthColor(analysis.strength)}
          label={strengthLabel(analysis.strength)}
          sx={{ height: 20, borderRadius: 1, fontSize: 12 }}
        />
      </Stack>
      <LinearProgress
        variant="determinate"
        value={progress}
        color={strengthColor(analysis.strength)}
        sx={{ height: 6, borderRadius: 999, bgcolor: 'action.hover' }}
      />
      <Stack spacing={0.4}>
        {rules.map((rule) => (
          <Typography
            key={rule.label}
            variant="caption"
            color={rule.ok ? 'success.main' : 'text.secondary'}
            sx={{ lineHeight: 1.45 }}
          >
            {rule.ok ? '✓' : '•'} {rule.label}
          </Typography>
        ))}
      </Stack>
    </Stack>
  )
}

function LogoMark({ active }: { active: boolean }) {
  return (
    <Box
      sx={{
        width: 136,
        height: 136,
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        bgcolor: (theme) => theme.palette.mode === 'light' ? 'rgba(255,255,255,0.44)' : 'rgba(255,255,255,0.06)',
        border: '1px solid',
        borderColor: (theme) => theme.palette.mode === 'light' ? 'rgba(255,255,255,0.74)' : 'rgba(148,163,184,0.18)',
        boxShadow: (theme) => theme.palette.mode === 'light'
          ? 'inset 0 1px 0 rgba(255,255,255,0.72), 0 16px 32px -24px rgba(15,23,42,0.42)'
          : 'inset 0 1px 0 rgba(255,255,255,0.08), 0 18px 34px -26px rgba(0,0,0,0.82)',
        transition: 'box-shadow 180ms ease, transform 180ms ease',
        transform: active ? 'translateY(-1px)' : 'none',
        overflow: 'hidden',
      }}
    >
      <Box
        component="img"
        src="/simadmin-logo.svg"
        alt="SimAdmin"
        sx={{
          width: 132,
          height: 132,
          display: 'block',
          filter: active
            ? 'drop-shadow(0 0 12px rgba(18,150,219,0.42))'
            : 'drop-shadow(0 14px 18px rgba(15,23,42,0.18))',
          transition: 'transform 180ms ease',
          '&:hover': { transform: 'scale(1.04)' },
        }}
      />
    </Box>
  )
}

function CommunityTooltip() {
  return (
    <Tooltip
      arrow
      placement="top"
      slotProps={{
        tooltip: {
          sx: {
            p: 0,
            maxWidth: 'none',
            bgcolor: 'rgba(255,255,255,0.94)',
            color: '#334155',
            border: '1px solid rgba(226,232,240,0.9)',
            boxShadow: '0 18px 48px -24px rgba(15,23,42,0.38)',
            backdropFilter: 'blur(18px)',
            WebkitBackdropFilter: 'blur(18px)',
          },
        },
        arrow: {
          sx: {
            color: 'rgba(255,255,255,0.94)',
            '&::before': {
              border: '1px solid rgba(226,232,240,0.9)',
              boxSizing: 'border-box',
            },
          },
        },
      }}
      title={(
        <Stack spacing={1} alignItems="center" sx={{ p: 1.25 }}>
          <Box
            component="img"
            src={communityQrUrl}
            alt="SimAdmin 社区"
            sx={{
              height: 132,
              width: 'auto',
              maxWidth: 240,
              objectFit: 'contain',
              borderRadius: 1,
              bgcolor: '#fff',
            }}
          />
          <Typography variant="caption" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>扫码加入 QQ 群</Typography>
        </Stack>
      )}
    >
      <Link component="button" type="button" underline="none" color="inherit" sx={{ font: 'inherit' }}>
        社区
      </Link>
    </Tooltip>
  )
}

export default function Login() {
  const theme = useTheme()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const nextPath = useMemo(() => getNextPath(searchParams.get('next')), [searchParams])
  const [mode, setMode] = useState<AuthMode>('login')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [focused, setFocused] = useState(false)
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const passwordAnalysis = useMemo(() => analyzePassword(password), [password])

  const handlePasswordChange = (value: string) => {
    const normalized = normalizePasswordInput(value)
    setPassword(normalized)
    if (value !== normalized) {
      setError('密码只能包含英文字母、数字和符号，不能包含空格或中文。')
    } else if (error?.includes('不能包含空格或中文')) {
      setError(null)
    }
  }

  const handleConfirmPasswordChange = (value: string) => {
    const normalized = normalizePasswordInput(value)
    setConfirmPassword(normalized)
    if (value !== normalized) {
      setError('密码只能包含英文字母、数字和符号，不能包含空格或中文。')
    } else if (error?.includes('不能包含空格或中文')) {
      setError(null)
    }
  }

  useEffect(() => {
    let cancelled = false
    api.getAuthStatus()
      .then((response) => {
        if (cancelled) return
        const status = response.data
        if (status?.authenticated) {
          void navigate(nextPath, { replace: true })
          return
        }
        setMode(status?.configured === false ? 'setup' : 'login')
      })
      .catch(() => {
        if (!cancelled) setMode('login')
      })
      .finally(() => {
        if (!cancelled) setChecking(false)
      })
    return () => { cancelled = true }
  }, [navigate, nextPath])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (!password) {
      setError(mode === 'setup' ? '请设置管理员密码。' : '请输入管理员密码。')
      return
    }

    if (!passwordAnalysis.lengthOk) {
      setError('密码长度需为 8-64 个字符。')
      return
    }

    if (mode === 'setup' && !passwordAnalysis.valid) {
      setError('密码不符合安全要求，请根据上方规则调整。')
      return
    }
    if (mode === 'setup' && password !== confirmPassword) {
      setError('两次输入的密码不一致')
      return
    }
    if (password.length < 8) {
      setError('密码至少需要 8 个字符')
      return
    }

    setLoading(true)
    try {
      if (mode === 'setup') {
        await api.setupAdminPassword(password)
      } else {
        await api.login(password)
      }
      void navigate(nextPath, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败')
    } finally {
      setLoading(false)
    }
  }

  const title = mode === 'setup' ? '设置管理员密码' : 'SimAdmin'
  const subtitle = mode === 'setup' ? '此密码用于保护本设备的管理后台' : '开源 SIM/eSIM 设备管理后台'

  return (
    <Box
      sx={{
        minHeight: '100vh',
        minWidth: 320,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        px: 2,
        py: 4,
        position: 'relative',
        overflow: 'hidden',
        bgcolor: 'background.default',
        color: 'text.primary',
        '&::before': {
          content: '""',
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          background: theme.palette.mode === 'light'
            ? 'radial-gradient(circle at 6% 2%, rgba(147,197,253,0.52), transparent 32%), radial-gradient(circle at 96% 22%, rgba(196,181,253,0.38), transparent 34%), radial-gradient(circle at 42% 108%, rgba(110,231,183,0.28), transparent 34%)'
            : 'radial-gradient(circle at 8% 0%, rgba(18,150,219,0.28), transparent 34%), radial-gradient(circle at 98% 24%, rgba(124,58,237,0.24), transparent 34%), radial-gradient(circle at 42% 110%, rgba(16,185,129,0.16), transparent 36%)',
        },
      }}
    >
      <Stack spacing={3} alignItems="center" sx={{ width: '100%', maxWidth: 430, position: 'relative', zIndex: 1 }}>
        <Stack spacing={0.8} alignItems="center" textAlign="center">
          <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: 0 }}>
            {title}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {subtitle}
          </Typography>
        </Stack>

        <Card sx={{ width: '100%', p: { xs: 3, sm: 4 }, borderRadius: 3 }}>
          {checking ? (
            <Box sx={{ minHeight: 318, display: 'grid', placeItems: 'center' }}>
              <CircularProgress size={30} />
            </Box>
          ) : (
            <Stack component="form" spacing={2.5} alignItems="center" noValidate onSubmit={(event) => { void handleSubmit(event) }}>
              <LogoMark active={focused || loading} />

              <Stack spacing={1.5} sx={{ width: '100%' }}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    minHeight: 52,
                    overflow: 'hidden',
                    borderRadius: 1.5,
                    border: '1px solid',
                    borderColor: focused ? 'primary.main' : 'divider',
                    bgcolor: theme.palette.mode === 'light' ? 'rgba(255,255,255,0.62)' : 'rgba(2,6,23,0.34)',
                    boxShadow: focused ? `0 0 0 3px ${theme.palette.primary.main}22` : 'none',
                    transition: 'border-color 160ms ease, box-shadow 160ms ease, background-color 160ms ease',
                  }}
                >
                  <LockIcon sx={{ ml: 1.7, mr: 0.5, color: 'text.secondary', fontSize: 20 }} />
                  <InputBase
                    type="password"
                    value={password}
                    onChange={(event) => handlePasswordChange(event.target.value)}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    placeholder={mode === 'setup' ? '设置管理员密码' : '管理员密码'}
                    autoFocus
                    required
                    inputProps={{ maxLength: PASSWORD_MAX_LENGTH }}
                    sx={{ flex: 1, px: 1.2, py: 1.1, fontSize: 16 }}
                  />
                  {mode === 'login' && (
                    <IconButton
                      type="submit"
                      aria-label="登录"
                      disabled={loading}
                      sx={{
                        alignSelf: 'stretch',
                        px: 2,
                        borderRadius: 0,
                        borderLeft: '1px solid',
                        borderColor: 'divider',
                      }}
                    >
                      {loading ? <CircularProgress size={20} color="inherit" /> : <ArrowIcon />}
                    </IconButton>
                  )}
                </Box>

                {mode === 'setup' && <PasswordStrengthHint password={password} />}

                {mode === 'setup' && (
                  <>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        minHeight: 52,
                        overflow: 'hidden',
                        borderRadius: 1.5,
                        border: '1px solid',
                        borderColor: 'divider',
                        bgcolor: theme.palette.mode === 'light' ? 'rgba(255,255,255,0.62)' : 'rgba(2,6,23,0.34)',
                      }}
                    >
                      <LockIcon sx={{ ml: 1.7, mr: 0.5, color: 'text.secondary', fontSize: 20 }} />
                      <InputBase
                        type="password"
                        value={confirmPassword}
                        onChange={(event) => handleConfirmPasswordChange(event.target.value)}
                        placeholder="确认管理员密码"
                        required
                        inputProps={{ maxLength: PASSWORD_MAX_LENGTH }}
                        sx={{ flex: 1, px: 1.2, py: 1.1, fontSize: 16 }}
                      />
                    </Box>
                    <Button
                      type="submit"
                      variant="contained"
                      size="large"
                      fullWidth
                      disabled={loading}
                      sx={{ minHeight: 46 }}
                    >
                      {loading ? <CircularProgress size={20} color="inherit" /> : '保存密码'}
                    </Button>
                  </>
                )}
              </Stack>

              {error && <Alert severity="error" sx={{ width: '100%' }}>{error}</Alert>}

              <Link
                href="https://github.com/3899/SimAdmin"
                target="_blank"
                rel="noopener noreferrer"
                underline="none"
                color="text.secondary"
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.75,
                  fontSize: 14,
                  fontWeight: 600,
                  '&:hover': { color: 'primary.main' },
                }}
              >
                <GitHubIcon sx={{ fontSize: 18 }} />
                点亮 Star
                <StarIcon sx={{ fontSize: 18, color: '#facc15' }} />
              </Link>
            </Stack>
          )}
        </Card>

        <Stack
          direction="row"
          spacing={1.5}
          alignItems="center"
          justifyContent="center"
          flexWrap="wrap"
          color="text.secondary"
          sx={{ fontSize: 13 }}
        >
          <Link
            href="https://github.com/3899/SimAdmin"
            target="_blank"
            rel="noopener noreferrer"
            underline="none"
            color="inherit"
            sx={{ '&:hover': { color: 'primary.main' } }}
          >
            Copyright © 2026 GitHub 3899
          </Link>
          <Typography component="span" color="text.disabled">|</Typography>
          <CommunityTooltip />
          <Typography component="span" color="text.disabled">|</Typography>
          <Typography component="span" sx={{ font: 'inherit' }}>v{__APP_VERSION__}</Typography>
        </Stack>
      </Stack>
    </Box>
  )
}
