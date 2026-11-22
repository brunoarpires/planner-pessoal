import { useEffect, useRef, useState } from 'react'
import { conviteGuardado, limparConvite } from '../convite'
import { api } from '../api'
import { supabase } from '../supabase'

export function EntrarFamilia({ onPronto }: { onPronto: () => void }) {
  const convite = conviteGuardado()
  const [meuNome, setMeuNome] = useState(''), [familia, setFamilia] = useState(''), [codigo, setCodigo] = useState(convite), [erro, setErro] = useState('')
  const tentou = useRef(false)
  const rodar = async (f: () => Promise<void>) => { setErro(''); try { await f(); limparConvite(); onPronto() } catch (e) { setErro((e as Error).message) } }
  // Com convite: preenche o nome do perfil (Google/e-mail) e entra sozinho na família.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const m = data.user?.user_metadata || {}
      const nome = (m.full_name || m.name || '').trim()
      if (nome) setMeuNome((n) => n || nome)
      if (convite && nome && !tentou.current) { tentou.current = true; rodar(() => api.entrarFamilia(convite, nome)) }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const blocoConvite = (
    <div className={`card space-y-3 ${convite ? 'ring-2 ring-brand-500' : ''}`}><h2 className="font-semibold">{convite ? '🎉 Você foi convidado(a)!' : 'Entrar com código de convite'}</h2>
      <input className="inp uppercase" placeholder="Ex.: A1B2C3D4" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
      <button className="btn w-full" disabled={!meuNome || !codigo} onClick={() => rodar(() => api.entrarFamilia(codigo, meuNome))}>Entrar na família</button></div>)
  return (
    <div className="min-h-dvh p-5 max-w-md mx-auto space-y-4">
      <h1 className="text-2xl font-bold pt-6">Bem-vindo(a)! 👋</h1>
      <div><label className="lbl">Seu nome</label><input className="inp" value={meuNome} onChange={(e) => setMeuNome(e.target.value)} /></div>
      {convite && blocoConvite}
      {!convite && <div className="card space-y-3"><h2 className="font-semibold">Criar família</h2>
        <input className="inp" value={familia} onChange={(e) => setFamilia(e.target.value)} />
        <button className="btn w-full" disabled={!meuNome || !familia} onClick={() => rodar(() => api.criarFamilia(familia, meuNome))}>Criar (serei administrador)</button></div>}
      {!convite && blocoConvite}
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      <button className="text-sm text-slate-500" onClick={() => supabase.auth.signOut()}>Sair</button>
    </div>
  )
}
