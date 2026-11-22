const CHAVE = 'planner.convite'
/** Captura ?convite=CODE do link (hash ou query) e guarda até a pessoa entrar na família. */
export function capturarConvite() {
  const m = (location.hash + '&' + location.search).match(/[?&]convite=([A-Za-z0-9]+)/)
  if (m) { localStorage.setItem(CHAVE, m[1].toUpperCase()); history.replaceState(null, '', location.pathname + '#/') }
}
export const conviteGuardado = () => localStorage.getItem(CHAVE) || ''
export const limparConvite = () => localStorage.removeItem(CHAVE)
export const linkConvite = (codigo: string) => `${location.origin}/#/entrar?convite=${codigo}`
export function textoConvite(familia: string, codigo: string) {
  return `Oi! 😊 Vem planejar o dia com a gente no Planner Diário (família ${familia}).\n\n1) Abra o link: ${linkConvite(codigo)}\n2) Entre com Google ou e-mail — o convite já vai preenchido (código ${codigo}).\n3) Dica: adicione o app à tela inicial do celular (Chrome: ⋮ > "Adicionar à tela inicial"; iPhone: Compartilhar > "Adicionar à Tela de Início").`
}
