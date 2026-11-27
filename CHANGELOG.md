# Changelog

## 1.1.0 — 27/11/2026

- Aba **Avisos** na barra inferior, com contador de não lidos: checklist de dias anteriores não fechado, eventos órfãos na Google Agenda e erro de conexão com o Google (precisa reconectar).
- Em Ajustes, opção de **limpar eventos órfãos** (só aparece quando há o que limpar): lista título e data, pede confirmação e remove apenas eventos criados pelo próprio app (`plannerId`).
- Tabela `avisos_lidos` (RLS por usuário) guarda o que já foi visto, em todos os aparelhos.

## 1.0.0 — 27/11/2026

Primeira versão etiquetada da cópia pública (código já publicado em 22/11/2026). Inclui:

- Checklist em dias anteriores, sem bloquear o app
- Edição compartilhada dos campos comuns por qualquer participante
- Recorrência sem fim, janela de 60 dias e mudança de data em “esta e as próximas”
- Pontuação, ranking, lembretes (Web Push) e sincronização com o Google Agenda

A limpeza automática de eventos órfãos no Google Agenda ainda não faz parte desta versão.
