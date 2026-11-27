import assert from 'node:assert/strict'
import { avisosAtivos, avisosNaoLidos, datasChecklistPendentePassado, fmtDataAviso } from '../node_modules/.tmp/teste/avisos.js'

let n = 0
const t = (nome, fn) => { fn(); n++; console.log('✔', nome) }

t('fmtDataAviso formata ISO em pt-BR', () => {
  assert.equal(fmtDataAviso('2026-11-23'), '23/11/2026')
})

t('datasChecklistPendentePassado ignora hoje e dias já checados', () => {
  assert.deepEqual(datasChecklistPendentePassado('2026-11-27', [
    { data: '2026-11-27', status_pessoal: null },
    { data: '2026-11-26', status_pessoal: null },
    { data: '2026-11-26', status_pessoal: 'fiz_bem' },
    { data: '2026-11-25', status_pessoal: 'parcial' },
    { data: '2026-11-24', status_pessoal: null },
  ]), ['2026-11-24', '2026-11-26'])
})

t('sem pendências, órfãos nem erro → lista vazia', () => {
  assert.deepEqual(avisosAtivos({ hoje: '2026-11-27', datasPendentesPassadas: [], orfaos: [], googleErro: null }), [])
})

t('órfãos null (ainda não listou) não gera aviso de órfão', () => {
  const lista = avisosAtivos({ hoje: '2026-11-27', datasPendentesPassadas: [], orfaos: null, googleErro: null })
  assert.equal(lista.some((a) => a.tipo === 'orfaos-google'), false)
})

t('monta aviso de órfãos, checklist e erro do Google', () => {
  const lista = avisosAtivos({
    hoje: '2026-11-27',
    datasPendentesPassadas: ['2026-11-23'],
    orfaos: [{ id: 'g2' }, { id: 'g1' }],
    googleErro: 'Acesso ao Google expirou ou foi removido. Conecte de novo.',
  })
  assert.deepEqual(lista.map((a) => a.id), ['google-erro', 'orfaos-google', 'checklist:2026-11-23'])
  assert.equal(lista[1].titulo, '2 eventos órfãos na Google Agenda')
  assert.equal(lista[1].destino, '#/ajustes/orfaos')
  assert.equal(lista[1].assinatura, 'g1,g2')
  assert.equal(lista[2].destino, '#/dia/2026-11-23')
})

t('não lido se nunca visto; lido se a assinatura bate; volta a não lido se a assinatura muda', () => {
  const lista = avisosAtivos({
    hoje: '2026-11-27',
    datasPendentesPassadas: ['2026-11-23'],
    orfaos: [{ id: 'g1' }],
    googleErro: 'falha A',
  })
  assert.equal(avisosNaoLidos(lista, []).length, 3)
  const depois = avisosNaoLidos(lista, [
    { aviso_id: 'orfaos-google', assinatura: 'g1' },
    { aviso_id: 'checklist:2026-11-23', assinatura: '2026-11-23' },
    { aviso_id: 'google-erro', assinatura: 'falha A' },
  ])
  assert.deepEqual(depois, [])
  const mudou = avisosAtivos({
    hoje: '2026-11-27',
    datasPendentesPassadas: ['2026-11-23'],
    orfaos: [{ id: 'g1' }, { id: 'g2' }],
    googleErro: 'falha A',
  })
  assert.deepEqual(avisosNaoLidos(mudou, [
    { aviso_id: 'orfaos-google', assinatura: 'g1' },
    { aviso_id: 'checklist:2026-11-23', assinatura: '2026-11-23' },
    { aviso_id: 'google-erro', assinatura: 'falha A' },
  ]).map((a) => a.id), ['orfaos-google'])
})

console.log(`\n${n} testes avisos ok`)
