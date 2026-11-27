import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Bell, CalendarDays, Trophy, Settings } from 'lucide-react'
import { supabase } from './supabase'
import { api, type Atividade, type Membro } from './api'
import { agoraNoFuso, fmtData } from './regras'
import { avisosAtivos, avisosNaoLidos, datasChecklistPendentePassado, type Aviso, type AvisoLido } from './avisos'
import { guardarRefreshToken, listarOrfaosGoogle, sincronizarGoogle, statusGoogle, type ResultadoOrfaos, type StatusGoogle } from './google'
import { GuiaNotificacoes } from './components/GuiaNotificacoes'
import { Login } from './pages/Login'
import { EntrarFamilia } from './pages/EntrarFamilia'
import { Dia } from './pages/Dia'
import { Mes } from './pages/Mes'
import { Ajustes } from './pages/Ajustes'
import { Avisos } from './pages/Avisos'

type Aba = 'dia' | 'mes' | 'ajustes' | 'avisos'
const ABAS: Aba[] = ['dia', 'mes', 'ajustes', 'avisos']

function lerHash(): { aba: Aba; dataDia?: string; destaqueAjustes?: 'orfaos' } {
  const partes = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  const aba = (ABAS.includes(partes[0] as Aba) ? partes[0] : 'dia') as Aba
  if (aba === 'dia' && /^\d{4}-\d{2}-\d{2}$/.test(partes[1] ?? '')) return { aba, dataDia: partes[1] }
  if (aba === 'ajustes' && partes[1] === 'orfaos') return { aba, destaqueAjustes: 'orfaos' }
  return { aba }
}

export default function App() {
  const [sessao, setSessao] = useState<Session | null | undefined>(undefined)
  const [eu, setEu] = useState<Membro | null | undefined>(undefined)
  const [pendentes, setPendentes] = useState<Atividade[]>([])
  const [rota, setRota] = useState(lerHash)
  const [relogio, setRelogio] = useState(() => agoraNoFuso())
  const [versaoSync, setVersaoSync] = useState(0)
  const [googleStatus, setGoogleStatus] = useState<StatusGoogle | null>(null)
  const [orfaos, setOrfaos] = useState<ResultadoOrfaos | null>(null)
  const [lidos, setLidos] = useState<AvisoLido[]>([])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessao(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      setSessao(s)
      // refresh token do Google só vem logo após o login: guarda no servidor e já sincroniza
      if (s?.provider_refresh_token) setTimeout(() => guardarRefreshToken(s).then((ok) => { if (ok) sincronizarGoogle().then(() => setVersaoSync((v) => v + 1)) }), 0)
    })
    const h = () => setRota(lerHash()); addEventListener('hashchange', h)
    return () => { data.subscription.unsubscribe(); removeEventListener('hashchange', h) }
  }, [])
  const uid = sessao?.user.id
  const carregarEu = useCallback(() => { if (uid) api.eu(uid).then(setEu).catch(() => setEu(null)) }, [uid])
  useEffect(() => { carregarEu() }, [carregarEu])
  const atualizarPendentes = useCallback(() => { if (uid) api.pendentes(uid).then(setPendentes) }, [uid])
  useEffect(() => { atualizarPendentes() }, [atualizarPendentes])
  const carregarLidos = useCallback(() => { if (uid) api.avisosLidos().then(setLidos).catch(() => setLidos([])) }, [uid])
  useEffect(() => { carregarLidos() }, [carregarLidos])
  const carregarOrfaos = useCallback(() => {
    if (!uid) return
    statusGoogle().then((s) => {
      setGoogleStatus(s)
      if (!s.conectado) { setOrfaos(null); return }
      listarOrfaosGoogle().then(setOrfaos).catch(() => setOrfaos(null))
    }).catch(() => { setGoogleStatus(null); setOrfaos(null) })
  }, [uid])
  useEffect(() => { carregarOrfaos() }, [carregarOrfaos])
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
    const v = () => { if (document.visibilityState === 'visible') { setRelogio(agoraNoFuso(eu?.fuso)); atualizarPendentes(); sync(); estender(); statusGoogle().then(setGoogleStatus).catch(() => {}) } }
    document.addEventListener('visibilitychange', v)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', v) }
  }, [eu?.fuso, atualizarPendentes, sync, estender])

  const aba = rota.aba
  useEffect(() => {
    if (aba === 'avisos' || aba === 'ajustes') carregarOrfaos()
  }, [aba, carregarOrfaos])

  const hoje = relogio.data
  const avisos = useMemo(() => avisosAtivos({
    hoje,
    datasPendentesPassadas: datasChecklistPendentePassado(hoje, pendentes),
    orfaos: orfaos?.orfaos ?? null,
    googleErro: googleStatus?.conectado ? (googleStatus.erro || null) : null,
  }), [hoje, pendentes, orfaos, googleStatus])
  const naoLidos = useMemo(() => avisosNaoLidos(avisos, lidos), [avisos, lidos])
  const idsNaoLidos = useMemo(() => new Set(naoLidos.map((a) => a.id)), [naoLidos])

  const ir = (a: Aba, extra?: string) => { location.hash = '#/' + a + (extra ? '/' + extra : '') }
  const marcarLido = async (a: Aviso) => {
    try { await api.marcarAvisoLido(a.id, a.assinatura); await carregarLidos() } catch { /* tabela ainda não publicada */ }
  }
  const abrirAviso = async (a: Aviso) => {
    await marcarLido(a)
    location.hash = a.destino
  }
  const marcarTodos = async () => {
    try { await api.marcarAvisosLidos(avisos.map((a) => ({ aviso_id: a.id, assinatura: a.assinatura }))); await carregarLidos() } catch { /* tabela ainda não publicada */ }
  }

  if (sessao === undefined || (sessao && eu === undefined)) return <div className="min-h-dvh flex items-center justify-center text-slate-400">Carregando…</div>
  if (!sessao) return <Login />
  if (!eu) return <EntrarFamilia onPronto={carregarEu} />

  const Tab = ({ id, icone, txt, badge }: { id: Aba; icone: React.ReactNode; txt: string; badge?: number }) => (
    <button onClick={() => ir(id)} className={`relative flex-1 flex flex-col items-center py-2 text-xs ${aba === id ? 'text-brand-600 font-semibold' : 'text-slate-500'}`}>
      <span className="relative">
        {icone}
        {!!badge && badge > 0 && (
          <span className="absolute -top-1.5 -right-2.5 min-w-[1.1rem] h-[1.1rem] px-0.5 rounded-full bg-red-600 text-white text-[10px] leading-[1.1rem] text-center font-bold">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </span>
      {txt}
    </button>
  )

  return (
    <div className="min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200 pt-[env(safe-area-inset-top)]">
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center justify-between"><span className="font-bold text-brand-700">Planner Diário</span><span className="text-sm text-slate-500 truncate ml-2">Olá, {eu.nome.split(' ')[0]}</span></div>
      </header>
      <main className="max-w-xl mx-auto p-4">
        {aba === 'dia' && <Dia eu={eu} hoje={hoje} pendentes={pendentes} atualizarPendentes={atualizarPendentes} versaoSync={versaoSync} dataInicial={rota.dataDia} />}
        {aba === 'mes' && <Mes eu={eu} hoje={hoje} />}
        {aba === 'avisos' && <Avisos avisos={avisos} idsNaoLidos={idsNaoLidos} onAbrir={abrirAviso} onMarcarTodos={marcarTodos} />}
        {aba === 'ajustes' && <Ajustes eu={eu} onMudou={carregarEu} orfaos={orfaos} onOrfaosMudou={carregarOrfaos} destaqueOrfaos={rota.destaqueAjustes === 'orfaos'} />}
      </main>
      <nav className="fixed bottom-0 inset-x-0 z-20 bg-white border-t border-slate-200 pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-xl mx-auto flex">
          <Tab id="dia" icone={<CalendarDays size={22} />} txt="Dia" />
          <Tab id="mes" icone={<Trophy size={22} />} txt="Mês" />
          <Tab id="avisos" icone={<Bell size={22} />} txt="Avisos" badge={naoLidos.length} />
          <Tab id="ajustes" icone={<Settings size={22} />} txt="Ajustes" />
        </div>
      </nav>
      <GuiaNotificacoes />
    </div>
  )
}
