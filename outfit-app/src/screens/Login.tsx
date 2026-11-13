import { useState, type FormEvent } from 'react'
import { register, signIn } from '../lib/api'

export function Login() {
  const params = new URLSearchParams(location.search)
  const invited = params.get('einladung') ?? ''
  const [mode, setMode] = useState<'in' | 'new'>(invited ? 'new' : 'in')
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [code, setCode] = useState(invited)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (mode === 'in') await signIn(email, password)
      else await register(email, password, name, code)
      history.replaceState(null, '', location.pathname)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Das hat nicht geklappt.')
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <div className="login-hero">
        <div className="logo" aria-hidden="true">
          G
        </div>
        <h1>Garderobe</h1>
        <p>Dein Kleiderschrank in der Tasche. Jeden Tag ein Outfit.</p>
      </div>
      <form className="login-card" onSubmit={submit}>
        <div className="seg" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'in'} className={mode === 'in' ? 'on' : ''} onClick={() => setMode('in')}>
            Anmelden
          </button>
          <button type="button" role="tab" aria-selected={mode === 'new'} className={mode === 'new' ? 'on' : ''} onClick={() => setMode('new')}>
            Konto anlegen
          </button>
        </div>
        {mode === 'new' && (
          <label className="field">
            <span>Dein Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" maxLength={60} required />
          </label>
        )}
        <label className="field">
          <span>E-Mail</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" required />
        </label>
        <label className="field">
          <span>Passwort{mode === 'new' && ' (mindestens 8 Zeichen)'}</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            minLength={mode === 'new' ? 8 : undefined}
            required
          />
        </label>
        {mode === 'new' && (
          <label className="field">
            <span>Einladungs-Code</span>
            <input value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="none" autoCorrect="off" placeholder="steht in deinem Einladungs-Link" />
          </label>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="btn primary block" disabled={busy}>
          {busy ? 'Einen Moment …' : mode === 'in' ? 'Anmelden' : 'Konto anlegen'}
        </button>
        {mode === 'new' && <p className="hint">Garderobe ist privat: Ein Konto bekommt nur, wer eingeladen wurde.</p>}
      </form>
    </div>
  )
}
