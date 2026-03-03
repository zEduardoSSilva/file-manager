
# vFleet Studio - File Manager

Sistema de processamento e análise de pipelines de logística otimizado para alta performance (20.000+ linhas).

## Repositório Oficial
[https://github.com/zEduardoSSilva/file-manager](https://github.com/zEduardoSSilva/file-manager)

## Tecnologias
- **Next.js 15 (App Router)**
- **Genkit (AI Integration)**
- **Firebase (Firestore & App Hosting)**
- **ShadCN UI & Tailwind CSS**
- **SheetJS (XLSX)** para processamento massivo de dados

## Pipeline Performaxxi Unificado
O sistema utiliza Server Actions otimizadas com filtragem precoce (Curto-Circuito) para processar volumes de dados de **20.000+ linhas** em segundos.

### Regras de Negócio:
- **Filtragem**: Ignora automaticamente rotas em status `STANDBY`.
- **Bonificação Proporcional**: Baseada em 4 critérios (R$ 2,00 por critério para Motoristas, R$ 1,80 para Ajudantes).
  1. **Raio de Entrega**: Metas >= 70% dos pedidos <= 100m.
  2. **SLA de Atendimento**: Metas >= 80% Janela cumprida.
  3. **Tempo de Atendimento**: Metas >= 100% com >= 1 min.
  4. **Sequência de Rotas**: Conformidade entre Planejado e Realizado.

### Estrutura de Pagamento:
- **Motorista**: Base R$ 8,00 (Total).
- **Ajudante**: Base R$ 7,20 (Total).
