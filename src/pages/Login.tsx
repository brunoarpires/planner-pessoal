import { useState } from 'react'
import { supabase, configurado } from '../supabase'
import { entrarComGoogle } from '../google'
import { conviteGuardado } from '../convite'

export function Login() {
  const [email, setEmail] = useState(''), [senha, setSenha] = useState(''), [modo, setModo] = useState<'entrar' | 'criar'>('entrar')
  const [msg, setMsg] = useState(''), [carregando, setCarregando] = useState(false)
  const enviar = async () => {
    setMsg(''); setCarregando(true)
    const r = modo === 'entrar' ? await supabase.auth.signInWithPassword({ email, password: senha })
      : await supabase.auth.signUp({ email, password: senha, options: { emailRedirectTo: location.origin } })
    setCarregando(false)
    if (r.error) setMsg(r.error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : r.error.message)
    else if (modo === 'criar' && !r.data.session) setMsg('Enviamos um link de confirmação para o seu e-mail.')
  }
  return (
    <div className="min-h-dvh flex items-center justify-center p-5">
      <div className="w-full max-w-sm space-y-5">
        <div className="text-center"><img src="/icon.svg" className="h-16 w-16 mx-auto" alt="" /><h1 className="text-2xl font-bold mt-3">Planner Diário</h1><p className="text-slate-500 text-sm">Organize o dia, feche o checklist, some pontos.</p></div>
        {conviteGuardado() && <p className="card text-sm text-center !py-3">🎉 Você recebeu um convite de família (código <b>{conviteGuardado()}</b>). Entre ou crie sua conta — você entra na família automaticamente.</p>}
        {!configurado && <p className="card text-sm text-amber-700">Supabase não configurado (.env). Veja o README.</p>}
        <button type="button" className="btn-sec w-full border border-slate-300 bg-white" onClick={() => entrarComGoogle().catch((e) => setMsg(e.message))}>
          <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-4z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C41 35.4 44 30 44 24c0-1.3-.1-2.7-.4-4z"/></svg>
          Entrar com Google
        </button>
        <div className="flex items-center gap-3 text-xs text-slate-400"><div className="h-px bg-slate-200 flex-1" />ou<div className="h-px bg-slate-200 flex-1" /></div>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (!carregando && email && senha.length >= 6) enviar() }}>
          <input className="inp" type="email" inputMode="email" name="email" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="next" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="inp" type="password" name="password" autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'} autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="go" placeholder="Senha (mín. 6)" value={senha} onChange={(e) => setSenha(e.target.value)} />
          <button type="submit" className="btn w-full" disabled={carregando || !email || senha.length < 6} onClick={enviar}>{modo === 'entrar' ? 'Entrar' : 'Criar conta'}</button>
          <button type="button" className="text-sm text-brand-600 w-full" onClick={() => setModo(modo === 'entrar' ? 'criar' : 'entrar')}>{modo === 'entrar' ? 'Não tem conta? Criar' : 'Já tenho conta'}</button>
        </form>
        {msg && <p className="text-sm text-center text-slate-700">{msg}</p>}
      </div>
    </div>
  )
}
