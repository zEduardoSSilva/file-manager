
# vFleet Studio - File Manager

Sistema de processamento e análise de pipelines de logística otimizado para alta performance (20.000+ linhas).

## Repositório
[https://github.com/zEduardoSSilva/file-manager](https://github.com/zEduardoSSilva/file-manager)

## Tecnologias
- **Next.js 15 (App Router)**
- **Genkit (AI Integration)**
- **Firebase (Firestore & App Hosting)**
- **ShadCN UI & Tailwind CSS**
- **SheetJS (XLSX)** para processamento massivo de dados

## Configuração do Pipeline Performaxxi
O sistema utiliza Server Actions otimizadas com filtragem precoce (Curto-Circuito) para processar volumes de dados de **20.000+ linhas** em segundos, ignorando rotas em `STANDBY` e aplicando regras de bonificação proporcional baseadas em 4 critérios:
1. **Raio de Entrega** (Metas >= 70% dos pedidos <= 100m)
2. **SLA de Atendimento** (Metas >= 80% Janela cumprida)
3. **Tempo de Atendimento** (Metas >= 100% com >= 1 min)
4. **Sequência de Rotas** (Conformidade Planejado vs Realizado)

O pipeline unifica Motoristas (Base R$ 8,00) e Ajudantes (Base R$ 7,20) em um único fluxo de processamento linear de alta performance.
