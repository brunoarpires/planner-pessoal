import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { CalendarDays, Trophy, Settings } from 'lucide-react'
import { supabase } from './supabase'
import { api, type Atividade, type Membro } from './api'
import { agoraNoFuso, datasComPendencia, fmtData } from './regras'
import { guardarRefreshToken, sincronizarGoogle } from './google'
import { GuiaNotificacoes } from './components/GuiaNotificacoes'
import { AvisoPendencias } from './components/AvisoPendencias'
import { Login } from './pages/Login'
import { EntrarFamilia } from './pages/EntrarFamilia'
import { Dia } from './pages/Dia'
import { Mes } from './pages/Mes'
import { Ajustes } from './pages/Ajustes'

type Aba = 'dia' | 'mes' | 'ajustes'
const abaDoHash = (): Aba => (['dia', 'mes', 'ajustes'].includes(location.hash.slice(2)) ? location.hash.slice(2) : 'dia') as Aba

export default function App() {
  const [sessao, setSessao] = useState<Session | null | undefined>(undefined)
  const [eu, setEu] = useState<Membro | null | undefined>(undefined)
  const [pendentes, setPendentes] = useState<Atividade[]>([])
  const [aba, setAba] = useState<Aba>(abaDoHash())
  const [relogio, setRelogio] = useState(() => agoraNoFuso())
  const [versaoSync, setVersaoSync] = useState(0)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessao(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      setSessao(s)
      // refresh token do Google só vem logo após o login: guarda no servidor e já sincroniza
      if (s?.provider_refresh_token) setTimeout(() => guardarRefreshToken(s).then((ok) => { if (ok) sincronizarGoogle().then(() => setVersaoSync((v) => v + 1)) }), 0)
    })
    const h = () => setAba(abaDoHash()); addEventListener('hashchange', h)
    return () => { data.subscription.unsubscribe(); removeEventListener('hashchange', h) }
  }, [])
  const uid = sessao?.user.id
  const carregarEu = useCallback(() => { if (uid) api.eu(uid).then(setEu).catch(() => setEu(null)) }, [uid])
  useEffect(() => { carregarEu() }, [carregarEu])
  const atualizarPendentes = useCallback(() => { if (uid) api.pendentes(uid).then(setPendentes) }, [uid])
  useEffect(() => { atualizarPendentes() }, [atualizarPendentes])
  const euId = eu?.user_id
  const estender = useCallback(() => {
    if (!eu) return
    api.estenderRecorrencias(eu, agoraNoFuso(eu.fuso).data)
      .then((p) => { if (p.length) alert(`Repetições puladas por falta de tempo no dia: ${[...new Set(p)].map(fmtData).join(', ')}.`) })
      .catch(() => {})
  }, [eu])
  useEffect(() => { estender() }, [euId]) // eslint-disable-line react-hooks/exhaustive-deps -- só na entrada / troca de usuário
  const sync = useCallback(() => { if (uid) sincronizarGoogle().then(() => setVersaoSync((v) => v + 1)) }, [uid])
  useEffect(() => { sync() }, [sync])
  useEffect(() => {
    const t = setInterval(() => setRelogio(agoraNoFuso(eu?.fuso)), 30000)
    const v = () => { if (document.visibilityState === 'visible') { setRelogio(agoraNoFuso(eu?.fuso)); atualizarPendentes(); sync(); estender() } }
    document.addEventListener('visibilitychange', v)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', v) }
  }, [eu?.fuso, atualizarPendentes, sync, estender])

  if (sessao === undefined || (sessao && eu === undefined)) return <div className="min-h-dvh flex items-center justify-center text-slate-400">Carregando…</div>
  if (!sessao) return <Login />
  if (!eu) return <EntrarFamilia onPronto={carregarEu} />

  const hoje = relogio.data
  // Pendências (hoje ou dias anteriores) só avisam — nunca bloqueiam o app.
  const avisoDatas = datasComPendencia(hoje, pendentes.filter((a) => a.data <= hoje))
  const ir = (a: Aba) => { location.hash = '#/' + a }
  const Tab = ({ id, icone, txt }: { id: Aba; icone: React.ReactNode; txt: string }) => (
    <button onClick={() => ir(id)} className={`flex-1 flex flex-col items-center py-2 text-xs ${aba === id ? 'text-brand-600 font-semibold' : 'text-slate-500'}`}>{icone}{txt}</button>)

  return (
    <div className="min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200 pt-[env(safe-area-inset-top)]">
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center justify-between"><span className="font-bold text-brand-700">Planner Diário</span><span className="text-sm text-slate-500 truncate ml-2">Olá, {eu.nome.split(' ')[0]}</span></div>
      </header>
      <AvisoPendencias datas={avisoDatas} onIrPara={() => ir('dia')} />
      <main className="max-w-xl mx-auto p-4">
        {aba === 'dia' && <Dia eu={eu} hoje={hoje} pendentes={pendentes} atualizarPendentes={atualizarPendentes} versaoSync={versaoSync} />}
        {aba === 'mes' && <Mes eu={eu} hoje={hoje} />}
        {aba === 'ajustes' && <Ajustes eu={eu} onMudou={carregarEu} />}
      </main>
      <nav className="fixed bottom-0 inset-x-0 z-20 bg-white border-t border-slate-200 pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-xl mx-auto flex"><Tab id="dia" icone={<CalendarDays size={22} />} txt="Dia" /><Tab id="mes" icone={<Trophy size={22} />} txt="Mês" /><Tab id="ajustes" icone={<Settings size={22} />} txt="Ajustes" /></div>
      </nav>
      <GuiaNotificacoes />
    </div>
  )
}
