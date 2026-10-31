# OBLIVION CALCULATOR — ChatGPT App scaffold

Projeto React/Vite + servidor MCP para integração como aplicativo no ChatGPT.

## Preparado nesta versão
- Interface React responsiva com personagem, atributos e comparação de equipamentos.
- Servidor MCP em `server/index.ts` com transporte HTTP.
- Ferramentas `oblivion_open_calculator`, `oblivion_calculate_hp` e `oblivion_list_classes`.
- Coeficientes aprovados para cinco classes e recurso visual `ui://widget/oblivion-calculator.html`.
- Endpoint MCP `POST /mcp` e health check `/health`.

## Estado e limitações
Este é um scaffold inicial, ainda não uma publicação ativa no ChatGPT. Os uploads são pré-visualizações locais, o OCR é assistivo e não preenche automaticamente todos os atributos. Banco persistente, autenticação multiusuário, testes completos e ajustes finais de segurança ainda precisam ser implementados.

## Desenvolvimento
Requer Node.js 20+.
```bash
npm install
npm run dev
```
Frontend: `http://localhost:5173`.
Em outro terminal: `npm run server`.
MCP: `http://localhost:3001/mcp`; health: `http://localhost:3001/health`.

## Deploy na Render
Crie um serviço **Web Service** conectado a este repositório GitHub.

- Runtime: Node
- Build command: `npm install && npm run build:all`
- Start command: `npm start`
- Health check path: `/health`
- Environment variable: `PUBLIC_ORIGIN=https://SEU-SERVICO.onrender.com`

A Render fornece `PORT` automaticamente. Após o deploy, valide `https://SEU-SERVICO.onrender.com/health` e conecte o MCP em `https://SEU-SERVICO.onrender.com/mcp`.

## Integração no ChatGPT
Em ambiente ChatGPT compatível com desenvolvimento de apps, adicione a integração MCP usando a URL pública terminada em `/mcp`. Teste as três ferramentas e a interface em desktop/mobile. Configure distribuição/compartilhamento conforme as opções disponíveis na conta.

Documentação: https://developers.openai.com/apps-sdk/
