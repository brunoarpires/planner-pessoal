// Teste rápido das regras de pontuação e bloqueio. Rode: npm test
import assert from 'node:assert/strict'
import { pontos, podeCriarEm, deveBloquear, datasComPendencia, rankingMensal, diaCompleto, dentroDaJanela, cabeNoDia, fmtDuracao, modoEdicao, alteracaoPermitida, podeMarcar, naoCabem, participantesFinais, podeEditarComum, podeAplicarEdicaoDetalhes, naoCabemNaEdicao, duracaoValida, ocorrencias, aGerar, encaixar, limiteRec, podeMoverPara, somaAnos } from '../node_modules/.tmp/teste/regras.js'

const A = (data, feito, status, user_id = 'alex') => ({ data, feito, status_pessoal: status, user_id })
let n = 0; const t = (nome, fn) => { fn(); n++; console.log('✔', nome) }

t('pontuação', () => {
  assert.equal(pontos(A('', true, 'fiz_bem')), 15)
  assert.equal(pontos(A('', true, 'parcial')), 10)
  assert.equal(pontos(A('', false, 'nao_fiz')), 0)
  assert.equal(pontos(A('', false, null)), 0)
})
t('dia completo', () => {
  assert.equal(diaCompleto([A('2026-10-30', true, 'fiz_bem'), A('2026-10-30', false, 'nao_fiz')], '2026-10-30'), true)
  assert.equal(diaCompleto([A('2026-10-30', true, null)], '2026-10-30'), false)
  assert.equal(diaCompleto([], '2026-10-30'), true)
})
t('criar só se dias anteriores 100%', () => {
  const ok = [A('2026-10-30', true, 'fiz_bem')]
  assert.equal(podeCriarEm('2026-11-01', '2026-10-31', ok).ok, true)
  const pend = [A('2026-10-30', true, 'fiz_bem'), A('2026-10-31', false, null)]
  assert.equal(podeCriarEm('2026-11-01', '2026-10-31', pend).ok, true) // hoje pendente não bloqueia
  const fut = [A('2026-11-03', false, null)]
  assert.equal(podeCriarEm('2026-11-08', '2026-10-31', fut).ok, true) // futuro pendente não bloqueia
  const pass = [A('2026-10-30', false, null)]
  assert.equal(podeCriarEm('2026-11-08', '2026-10-31', pass).ok, true) // passado pendente não bloqueia mais
  assert.equal(podeCriarEm('2026-10-31', '2026-10-31', pass).ok, true)
  assert.equal(podeCriarEm('2026-10-29', '2026-10-31', ok).ok, false) // passado nunca
})
t('app nunca bloqueia por checklist incompleto', () => {
  const hoje = [A('2026-10-31', false, null)]
  assert.deepEqual(deveBloquear('2026-10-31', '21:59', '22:00', hoje), [])
  assert.deepEqual(deveBloquear('2026-10-31', '22:00', '22:00', hoje), []) // após fim do dia: não trava
  assert.deepEqual(deveBloquear('2026-10-31', '23:00', '22:00', [A('2026-10-31', true, 'fiz_bem')]), [])
  assert.deepEqual(deveBloquear('2026-11-01', '08:00', '22:00', hoje), []) // dia anterior pendente não trava
})
t('aviso de pendências (não bloqueante)', () => {
  const lista = [A('2026-10-30', false, null), A('2026-10-31', false, null), A('2026-10-31', true, 'fiz_bem'), A('2026-11-02', false, null)]
  assert.deepEqual(datasComPendencia('2026-10-31', lista), ['2026-10-30', '2026-10-31'])
  assert.deepEqual(datasComPendencia('2026-10-31', [A('2026-10-31', true, 'parcial')]), [])
})
t('janela do dia', () => {
  assert.equal(dentroDaJanela('07:00', '06:00', 16), true)
  assert.equal(dentroDaJanela('23:00', '06:00', 16), false)
})
t('ranking mensal', () => {
  const r = rankingMensal([A('2026-10-01', true, 'fiz_bem', 'maria'), A('2026-10-02', true, 'parcial', 'alex'), A('2026-11-01', true, 'fiz_bem', 'alex')], '2026-10')
  assert.deepEqual(r.map((x) => [x.user_id, x.pontos]), [['maria', 15], ['alex', 10]])
})
t('limite de tempo previsto no dia', () => {
  assert.equal(cabeNoDia(0, 30, 16).ok, true)
  assert.equal(cabeNoDia(930, 30, 16).ok, true)   // 15h30 + 30min = 16h exatas
  const r = cabeNoDia(930, 45, 16); assert.equal(r.ok, false); assert.equal(r.restante, 30); assert.match(r.motivo, /Restam 30min/)
  assert.equal(cabeNoDia(960, 5, 16).ok, false)
  assert.equal(cabeNoDia(1000, 15, 16).restante, 0)
  assert.equal(fmtDuracao(90), '1h30'); assert.equal(fmtDuracao(60), '1h'); assert.equal(fmtDuracao(45), '45min')
})
t('dias passados: checklist ajustável, detalhes só leitura', () => {
  const H = '2026-10-31'
  assert.equal(modoEdicao(A('2026-10-31', false, null), H), 'livre')
  assert.equal(modoEdicao(A('2026-11-02', false, 'parcial'), H), 'livre')
  assert.equal(modoEdicao(A('2026-10-30', false, null), H), 'leitura')
  assert.equal(modoEdicao(A('2026-10-30', true, 'fiz_bem'), H), 'leitura')
  assert.equal(podeMarcar(A('2026-10-30', false, null), H), true)  // dia anterior: pode marcar/ajustar
  assert.equal(podeMarcar(A(H, false, null), H), true)
  assert.equal(podeMarcar(A('2026-11-05', false, null), H), false) // futuro: ainda não
  const aberta = A('2026-10-30', false, null), fechada = A('2026-10-30', true, 'parcial')
  assert.equal(alteracaoPermitida(aberta, { feito: true, status_pessoal: 'fiz_bem', status_texto: 'ok' }, H), true) // marcar ontem
  assert.equal(alteracaoPermitida(fechada, { status_pessoal: 'fiz_bem', feito: true }, H), true) // corrigir checklist
  assert.equal(alteracaoPermitida(fechada, { status_texto: 'mudei' }, H), true)
  assert.equal(alteracaoPermitida(fechada, { resultado: 'nao_feito', motivo_nao_feito: 'falta_tempo' }, H), true)
  assert.equal(alteracaoPermitida(A(H, false, null), { feito: true, status_pessoal: 'fiz_bem' }, H), true)
  assert.equal(alteracaoPermitida(A('2026-11-05', false, null), { feito: true }, H), false) // futuro não marca
  assert.equal(alteracaoPermitida(A('2026-11-05', false, null), { titulo: 'x' }, H), true)
  assert.equal(alteracaoPermitida(aberta, { status_pessoal: 'nao_fiz', titulo: 'x' }, H), false) // detalhe + checklist no passado
  assert.equal(alteracaoPermitida(aberta, { data: H, status_pessoal: 'parcial' }, H), false)
  assert.equal(alteracaoPermitida(aberta, { titulo: 'x' }, H), false)           // detalhe no passado: não
  assert.equal(alteracaoPermitida(aberta, null, H), false)                      // não exclui passado
  assert.equal(alteracaoPermitida(fechada, null, H), false)
  assert.equal(alteracaoPermitida(A(H, false, 'parcial'), { titulo: 'x' }, H), true)
})
t('atividades compartilhadas', () => {
  const ps = [{ user_id: 'b', nome: 'Alex', horas_dia: 16 }, { user_id: 'd', nome: 'Maria', horas_dia: 2 }]
  assert.deepEqual(naoCabem(ps, { b: 60, d: 100 }, 30), [{ user_id: 'd', nome: 'Maria', restante: 20 }])
  assert.deepEqual(naoCabem(ps, {}, 30), [])
  assert.deepEqual(participantesFinais('b', ['b', 'd', 'k'], ['d'], false), ['b', 'd'])
  assert.deepEqual(participantesFinais('b', ['b', 'd', 'k'], [], true), ['b', 'd', 'k'])
  assert.deepEqual(participantesFinais('b', ['b', 'd'], ['x'], false), ['b'])   // fora da família é ignorado
  assert.equal(podeEditarComum({ grupo_id: null, user_id: 'd' }, null), true)
  assert.equal(podeEditarComum({ grupo_id: 'g', user_id: 'b' }, 'b'), true)
  assert.equal(podeEditarComum({ grupo_id: 'g', user_id: 'd' }, 'b'), true)  // participante não-criador também edita
  assert.equal(podeEditarComum({ grupo_id: 'g', user_id: 'd' }, null), false) // sem grupo carregado: trava
})
t('participante não-criador edita Só esta e Esta e as próximas', () => {
  const H = '2026-11-11'
  // Caso Alex: Academia criada pela Maria (criador 'maria'), Alex é participante
  const academia = { grupo_id: 'g1', user_id: 'alex', recorrencia_id: 'rec1', data: H }
  assert.equal(podeAplicarEdicaoDetalhes(academia, 'maria', 'so', H), true)
  assert.equal(podeAplicarEdicaoDetalhes(academia, 'maria', 'prox', H), true) // esta e as próximas (1h)
  assert.equal(podeAplicarEdicaoDetalhes({ ...academia, data: '2026-11-10' }, 'maria', 'so', H), false) // passado
  assert.equal(podeAplicarEdicaoDetalhes({ ...academia, recorrencia_id: null }, 'maria', 'prox', H), false) // sem série
  assert.equal(podeAplicarEdicaoDetalhes(academia, null, 'so', H), false) // grupo não carregado
  assert.equal(podeAplicarEdicaoDetalhes({ grupo_id: null, user_id: 'alex', recorrencia_id: 'r', data: H }, null, 'prox', H), true)
})
t('editar duração de compartilhada', () => {
  const ps = [{ user_id: 'b', nome: 'Alex', horas_dia: 16 }, { user_id: 'd', nome: 'Maria', horas_dia: 2 }]
  const copias = [{ user_id: 'b', duracao_min: 30 }, { user_id: 'd', duracao_min: 30 }]
  assert.deepEqual(naoCabemNaEdicao(copias, ps, { b: 100, d: 110 }, 30), [])            // mesma duração continua cabendo
  assert.deepEqual(naoCabemNaEdicao(copias, ps, { b: 100, d: 110 }, 60), [{ user_id: 'd', nome: 'Maria', restante: 40 }])
  assert.deepEqual(naoCabemNaEdicao([{ user_id: 'b', duracao_min: 30 }], ps, { b: 100, d: 120 }, 60), []) // Maria não participa
})
t('duração mínima de 1 min', () => {
  assert.equal(duracaoValida(1), true); assert.equal(duracaoValida(0), false); assert.equal(duracaoValida(1440), true); assert.equal(duracaoValida(1441), false)
  assert.equal(fmtDuracao(1), '1min'); assert.equal(cabeNoDia(959, 1, 16).ok, true)
})
t('recorrência', () => {
  const R = (o) => ({ tipo: 'diaria', intervalo: 1, dias_semana: [], data_inicio: '2026-11-01', hora: '08:00', fim_data: null, fim_qtd: null, ...o })
  assert.deepEqual(ocorrencias(R({ fim_qtd: 3 }), '2027-01-01').map((o) => o.data), ['2026-11-01', '2026-11-02', '2026-11-03'])
  assert.deepEqual(ocorrencias(R({ intervalo: 2 }), '2026-11-06').map((o) => o.data), ['2026-11-01', '2026-11-03', '2026-11-05'])
  assert.deepEqual(ocorrencias(R({ tipo: 'horas', intervalo: 4 }), '2026-11-01', '20:00').map((o) => o.hora), ['08:00', '12:00', '16:00', '20:00'])
  // 01/11/2026 é domingo; seg(1) e qua(3)
  assert.deepEqual(ocorrencias(R({ tipo: 'semanal', dias_semana: [1, 3] }), '2026-11-11').map((o) => o.data), ['2026-11-02', '2026-11-04', '2026-11-09', '2026-11-11'])
  assert.deepEqual(ocorrencias(R({ tipo: 'semanal', dias_semana: [1], intervalo: 2 }), '2026-11-30').map((o) => o.data), ['2026-11-02', '2026-11-16', '2026-11-30'])
  assert.deepEqual(ocorrencias(R({ tipo: 'mensal', data_inicio: '2027-01-31' }), '2027-04-30').map((o) => o.data), ['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30'])
  assert.deepEqual(ocorrencias(R({ tipo: 'anual', data_inicio: '2028-02-29' }), '2030-03-01').map((o) => o.data), ['2028-02-29', '2029-02-28', '2030-02-28'])
  assert.equal(limiteRec(R({})), '9999-12-31')                                      // sem fim
  assert.equal(limiteRec(R({ fim_data: '2030-06-01' })), '2030-06-01')
  assert.deepEqual(ocorrencias(R({ fim_data: '2026-11-02' }), '2027-01-01').length, 2)
  assert.equal(ocorrencias(R({}), '2027-11-01').length, 366)                         // 1 ano sem teto artificial
  assert.equal(ocorrencias(R({}), '2028-11-01').length, 732)                         // 2 anos: continua (antes parava em 12 meses)
  const g = aGerar(R({}), '2026-11-10', '2026-11-05')
  assert.equal(g.lista[0].data, '2026-11-11'); assert.equal(g.lista.at(-1).data, '2027-01-04')
  assert.equal(g.ate, '2027-01-04')                                                   // horizonte 60 dias, não materializa anos
  // Longe no futuro: ainda só materializa hoje+60 (não gera anos de uma vez)
  const gLonge = aGerar(R({}), '2028-06-01', '2028-05-01')
  assert.equal(gLonge.lista[0].data, '2028-06-02'); assert.equal(gLonge.ate, '2028-06-30'); assert.equal(gLonge.lista.length, 29)
  // Fim por data distante: horizonte rola até a data
  const gData = aGerar(R({ fim_data: '2031-01-01' }), '2030-11-10', '2030-11-05')
  assert.equal(gData.lista.at(-1).data, '2031-01-01'); assert.equal(gData.ate, '2031-01-01')
  assert.deepEqual(aGerar(R({ fim_qtd: 5 }), '2026-11-03', '2026-11-01').lista.map((o) => o.data), ['2026-11-04', '2026-11-05'])
  // fim_qtd=12: para após 12 (o bug antigo do default da UI)
  assert.equal(ocorrencias(R({ fim_qtd: 12 }), '2030-01-01').length, 12)
  assert.equal(somaAnos('2026-11-14', 1), '2027-11-14')
  assert.equal(somaAnos('2028-02-29', 1), '2029-02-28')
  const e = encaixar([{ data: 'a', hora: null }, { data: 'b', hora: null }, { data: 'b', hora: null }], 60, 2, { a: 90, b: 30 })
  assert.deepEqual(e.pulados, ['a', 'b']); assert.equal(e.ok.length, 1)
})
t('mover data', () => {
  assert.equal(podeMoverPara('2026-11-01', '2026-11-01').ok, true)
  assert.equal(podeMoverPara('2026-12-31', '2026-11-01').ok, true)
  assert.equal(podeMoverPara('2026-10-31', '2026-11-01').ok, false)
  assert.match(podeMoverPara('2026-10-31', '2026-11-01').motivo, /anterior a hoje \(01\/11\)/)
  assert.equal(podeMoverPara('', '2026-11-01').ok, false)
})
console.log(`\n${n} grupos de testes passaram.`)
