// Testes sintéticos da limpeza de órfãos (sem Google, sem banco, sem secrets).
import assert from 'node:assert/strict'
import { decidirOrfao, deveRemoverOrfao, eventosComPlannerId, idsPorPlannerId, listarOrfaosParaRemover } from '../node_modules/.tmp/teste/google-orfaos.js'

let n = 0
const t = (nome, fn) => { fn(); n++; console.log('✔', nome) }

t('ausência real da atividade → remove', () => {
  assert.equal(deveRemoverOrfao({ atividade: null, error: null, eventId: 'g1', idsDoMesmoPlanner: ['g1'] }), true)
  assert.equal(decidirOrfao({ atividade: null, error: null, eventId: 'g1', idsDoMesmoPlanner: ['g1'] }).motivo, 'atividade_ausente')
})

t('atividade existe e IDs batem → preserva', () => {
  assert.equal(deveRemoverOrfao({
    atividade: { id: 'a1', google_event_id: 'g1' }, error: null, eventId: 'g1', idsDoMesmoPlanner: ['g1'],
  }), false)
})

t('atividade com google_event_id nulo → preserva (POST ainda não gravado / ambíguo)', () => {
  assert.equal(deveRemoverOrfao({
    atividade: { id: 'a1', google_event_id: null }, error: null, eventId: 'g-novo', idsDoMesmoPlanner: ['g-novo'],
  }), false)
  assert.equal(decidirOrfao({
    atividade: { id: 'a1', google_event_id: null }, error: null, eventId: 'g-novo', idsDoMesmoPlanner: ['g-novo'],
  }).motivo, 'sem_google_event_id')
})

t('erro de DB lança e NÃO remove (não trata falha como ausência)', () => {
  assert.throws(
    () => deveRemoverOrfao({ atividade: null, error: { message: 'timeout' }, eventId: 'g1', idsDoMesmoPlanner: ['g1'] }),
    /Falha ao consultar atividade/,
  )
})

t('mismatch com canônico ainda na lista → remove só a duplicata', () => {
  assert.equal(deveRemoverOrfao({
    atividade: { id: 'a1', google_event_id: 'g-canonico' },
    error: null,
    eventId: 'g-duplicata',
    idsDoMesmoPlanner: ['g-canonico', 'g-duplicata'],
  }), true)
  assert.equal(deveRemoverOrfao({
    atividade: { id: 'a1', google_event_id: 'g-canonico' },
    error: null,
    eventId: 'g-canonico',
    idsDoMesmoPlanner: ['g-canonico', 'g-duplicata'],
  }), false)
})

t('mismatch ambíguo (DB stale / único evento) → preserva', () => {
  assert.equal(deveRemoverOrfao({
    atividade: { id: 'a1', google_event_id: 'g-stale' },
    error: null,
    eventId: 'g-unico',
    idsDoMesmoPlanner: ['g-unico'],
  }), false)
  assert.equal(decidirOrfao({
    atividade: { id: 'a1', google_event_id: 'g-stale' },
    error: null,
    eventId: 'g-unico',
    idsDoMesmoPlanner: ['g-unico'],
  }).motivo, 'mismatch_ambiguo')
})

t('corrida POST→lista: canônico ainda não na janela → preserva o novo', () => {
  // Sync A criou g-novo; DB ainda aponta g-velho (fora da lista desta coleta)
  assert.equal(deveRemoverOrfao({
    atividade: { id: 'a1', google_event_id: 'g-velho' },
    error: null,
    eventId: 'g-novo',
    idsDoMesmoPlanner: ['g-novo'],
  }), false)
})

t('filtro user_id: atividade de outro usuário conta como ausência só após lookup filtrado', () => {
  const atividadeDoDono = { id: 'a-dani', google_event_id: 'g-dani', user_id: 'dani' }
  const lookupBruno = atividadeDoDono.user_id === 'bruno' ? atividadeDoDono : null
  assert.equal(deveRemoverOrfao({
    atividade: lookupBruno, error: null, eventId: 'g-dani', idsDoMesmoPlanner: ['g-dani'],
  }), true)
})

t('eventos sem plannerId / cancelados nunca entram', () => {
  const items = [
    { id: 'pessoal', status: 'confirmed', summary: 'Dentista' },
    { id: 'cancelado', status: 'cancelled', extendedProperties: { private: { plannerId: 'a1' } } },
    { id: 'planner', status: 'confirmed', extendedProperties: { private: { plannerId: 'a1' } } },
  ]
  assert.deepEqual(eventosComPlannerId(items).map((e) => e.id), ['planner'])
})

t('idsPorPlannerId agrupa duplicatas por plannerId', () => {
  const m = idsPorPlannerId([
    { id: 'g1', plannerId: 'a1' },
    { id: 'g2', plannerId: 'a1' },
    { id: 'g3', plannerId: 'a2' },
  ])
  assert.deepEqual(m.get('a1'), ['g1', 'g2'])
  assert.deepEqual(m.get('a2'), ['g3'])
})

t('regressão: ausência + canônico presente não se confundem', () => {
  assert.equal(deveRemoverOrfao({
    atividade: null, error: null, eventId: 'g-orfao', idsDoMesmoPlanner: ['g-orfao'],
  }), true)
  assert.equal(deveRemoverOrfao({
    atividade: { id: 'a2', google_event_id: 'g-ok' }, error: null, eventId: 'g-ok', idsDoMesmoPlanner: ['g-ok'],
  }), false)
})

t('listarOrfaosParaRemover: só ausência e duplicata real; ignora pessoais já filtrados', () => {
  const candidatos = [
    { id: 'g-orfao', plannerId: 'a-sumiu', titulo: 'Antiga', data: '2026-11-20', hora: '09:00' },
    { id: 'g-ok', plannerId: 'a-ok', titulo: 'Academia', data: '2026-11-27', hora: '07:00' },
    { id: 'g-dup', plannerId: 'a-ok', titulo: 'Academia (cópia)', data: '2026-11-27', hora: '07:00' },
    { id: 'g-amb', plannerId: 'a-amb', titulo: 'Ambigua', data: '2026-11-28', hora: null },
    { id: 'g-pendente', plannerId: 'a-novo', titulo: 'Novo', data: '2026-11-29', hora: '10:00' },
  ]
  const existentes = new Map([
    ['a-ok', { id: 'a-ok', google_event_id: 'g-ok' }],
    ['a-amb', { id: 'a-amb', google_event_id: 'g-stale' }],
    ['a-novo', { id: 'a-novo', google_event_id: null }],
  ])
  const lista = listarOrfaosParaRemover(candidatos, existentes)
  assert.deepEqual(lista.map((e) => [e.id, e.motivo]), [
    ['g-orfao', 'atividade_ausente'],
    ['g-dup', 'duplicata_com_canonico'],
  ])
})

t('listarOrfaosParaRemover com lista vazia → nenhum órfão', () => {
  assert.deepEqual(listarOrfaosParaRemover([], new Map()), [])
})

console.log(`\n${n} testes google-orfaos ok`)
