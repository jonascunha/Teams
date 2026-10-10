# Desafio 21 Dias · MOOH Personal Studio

Web app (PWA) do desafio de 21 dias. Abre no navegador do celular (Android e iPhone) e pode ser **instalado na tela inicial** como um aplicativo, sem passar pelas lojas.

## Funcionalidades

**Para os participantes**
- Cadastro com **código do desafio** (só entra quem recebeu o código) e login. A sessão dura 90 dias.
- **Início:** pontuação com progresso até a meta (50 pontos), desafio do dia, dias pendentes e check-in com foto.
- **Desafios:** os 21 cards do checklist impresso (3 semanas). Cada dia é liberado na sua data. O participante marca como feito e pode escrever uma anotação ou resposta (os dias 1, 7, 15 e 21 pedem reflexão).
- **Desafio individual:** cada pessoa define o próprio desafio para os 21 dias e marca os dias em que cumpriu. Também tem "Meu compromisso" ("Daqui a 21 dias eu quero...") e a lista **Minhas metas**.
- **Feed:** fotos (reduzidas no próprio celular antes do envio), curtidas (toque duplo na foto) e comentários. A primeira foto de cada dia vale **+1 ponto** (Foto / check-in).
- **Mural:** recados e missões dos personais, com recados fixados no topo.
- **Ranking** e **perfil** com foto, estatísticas, galeria de fotos e troca de senha.

**Para os personais (administradores)**
- Definem a **data de início** (Dia 1), o código de inscrição, a meta de pontos e se o ranking fica visível.
- Veem o progresso de cada participante, o compromisso, o desafio individual e as respostas.
- **Lançam pontos bônus** com um toque: treino realizado, água, atividade extra, missão semanal, desafio surpresa, ajudar um colega.
- **Editam qualquer dia** (título, descrição, pontos, ícone), por exemplo para liberar a missão surpresa do dia 12.
- Publicam no mural, apagam posts e comentários, promovem outro personal a admin, geram senha temporária e removem participantes.

> **A primeira conta criada vira administradora.** Crie a conta do personal antes de passar o código para os alunos. Os outros personais se cadastram normalmente e são promovidos no painel.

## Rodando localmente

Requer **Node.js 22.13+** (usa o SQLite embutido no Node, então não há dependências nativas).

```bash
cd desafio21
npm install
npm start          # http://localhost:3000
npm test           # testes da API
```

### Variáveis de ambiente

| Variável | Padrão | Para quê |
|---|---|---|
| `PORT` | `3000` | Porta HTTP |
| `DATA_DIR` | `./data` | Onde ficam o banco (`desafio.db`) e as fotos (`uploads/`). **Precisa ser um armazenamento persistente.** |
| `JOIN_CODE` | `MOOH21` | Código de inscrição inicial (pode ser alterado no painel) |
| `TZ_CHALLENGE` | `America/Sao_Paulo` | Fuso usado para calcular o "dia" do desafio |

## Publicando (deploy)

O app precisa de **HTTPS** (para instalar como PWA no celular) e de um **disco persistente** (banco e fotos). Opções:

- **Render:** o `render.yaml` está pronto (New → Blueprint). Use o plano Starter com disco de 1 GB.
- **Railway / Fly.io / qualquer VPS:** use o `Dockerfile` e monte um volume em `/data`.

```bash
docker build -t desafio21 desafio21
docker run -p 3000:3000 -v desafio21-dados:/data -e JOIN_CODE=MOOH21 desafio21
```

**Backup:** copie a pasta `DATA_DIR` (`desafio.db` + `uploads/`).

## Instalando no celular

- **iPhone (Safari):** abra o link → **Compartilhar** → **Adicionar à Tela de Início**.
- **Android (Chrome):** abra o link → menu **⋮** → **Instalar app**.

## Estrutura

```
desafio21/
├── server.js            # ponto de entrada
├── src/app.js           # API (Express) e regras de acesso
├── src/db.js            # esquema do SQLite
├── src/challenge.js     # conteúdo inicial dos 21 dias, pontos e premiação
├── public/              # front-end (SPA sem build) + PWA (manifest, service worker, ícones)
├── scripts/make-icons.js
└── test/api.test.js
```
