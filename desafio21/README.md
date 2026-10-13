# Desafio 21 Dias · MOOH Personal Studio

Web app (PWA) do desafio de 21 dias. Abre no navegador do celular (Android e iPhone) e pode ser **instalado na tela inicial** como um aplicativo, sem passar pelas lojas.

## Funcionalidades

**Para os participantes**
- Cadastro com **código do desafio** (só entra quem recebeu o código) e login com **e-mail e senha** ou com a **conta Google**. A sessão dura 90 dias.
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

Requer **Node.js 22.13+**. Sem configuração nenhuma, usa SQLite e uma pasta local para as fotos.

```bash
cd desafio21
npm install
npm start          # http://localhost:3000
npm test           # testes da API (SQLite)
TEST_DATABASE_URL=postgres://usuario:senha@localhost/banco_teste npm test   # também contra PostgreSQL
```

### Variáveis de ambiente

| Variável | Padrão | Para quê |
|---|---|---|
| `DATABASE_URL` | — | PostgreSQL (Cloud SQL). Sem ela, usa SQLite em `DATA_DIR`. |
| `GCS_BUCKET` | — | Bucket do Cloud Storage para as fotos. Sem ela, salva em `DATA_DIR/uploads`. |
| `DATA_DIR` | `./data` | Pasta do SQLite e das fotos no modo local |
| `GOOGLE_CLIENT_ID` | — | Ativa o botão "Continuar com Google" (veja abaixo). Sem ela, só e-mail e senha. |
| `JOIN_CODE` | `MOOH21` | Código de inscrição inicial (pode ser alterado no painel) |
| `TZ_CHALLENGE` | `America/Sao_Paulo` | Fuso usado para calcular o "dia" do desafio |
| `PORT` | `3000` | Porta HTTP (o Cloud Run define sozinho) |

## Publicando no Google Cloud

Arquitetura: **Cloud Run** (o app, com HTTPS automático) + **Cloud SQL PostgreSQL** (banco, com backup diário) + **Cloud Storage** (fotos, bucket privado; as fotos só são entregues para quem está logado) + **Secret Manager** (senha do banco).

1. No [console do Google Cloud](https://console.cloud.google.com), selecione o projeto que tem os créditos e anote o **ID do projeto**.
2. Abra o **Cloud Shell** (ícone `>_` no topo). Ele já vem com `gcloud`, `git` e `node`.
3. Coloque o código no Cloud Shell (com `git clone` do repositório, ou com **Upload** de um .zip da pasta `desafio21`) e rode:

   ```bash
   cd desafio21
   PROJECT_ID=seu-projeto ./deploy-gcp.sh
   ```

   Na primeira vez leva uns 15 minutos (a criação do Cloud SQL é a parte demorada). No final, o script mostra o endereço do app (`https://desafio21-xxxx.a.run.app`).
4. Abra o endereço, **crie primeiro a conta do personal** (vira administradora) e defina a data de início no painel.
5. Para publicar uma nova versão depois, rode o mesmo comando de novo.

Opções do script (variáveis de ambiente): `REGION` (padrão `southamerica-east1`, São Paulo), `JOIN_CODE`, `SERVICE`, `INSTANCE`, `BUCKET`.

**Custo estimado:** o Cloud SQL `db-f1-micro` custa cerca de US$ 10 a 15 por mês e fica ligado o tempo todo. O Cloud Run e o Storage, para o tamanho de uma turma, ficam praticamente dentro da cota gratuita. **Depois do desafio**, se quiser parar de gastar créditos, exporte um backup e apague a instância (`gcloud sql instances delete desafio21-db`).

### Ativar o login com Google (opcional)

Faça depois da primeira publicação, porque é preciso o endereço do app.

1. No console, abra **Google Auth Platform** (ou *APIs e serviços → Tela de permissão OAuth*) e configure: tipo **Externo**, nome do app "Desafio 21 Dias" e um e-mail de suporte.
2. Em **Público-alvo**, clique em **Publicar app** ("Em produção"). Sem isso, só as contas cadastradas como "usuários de teste" conseguem entrar. O app pede só nome e e-mail, então não precisa de verificação do Google.
3. Em **Clientes** (ou *Credenciais → Criar credenciais → ID do cliente OAuth*), crie um cliente do tipo **Aplicativo da Web** e, em **Origens JavaScript autorizadas**, coloque o endereço do app (ex.: `https://desafio21-xxxx.southamerica-east1.run.app`) e o domínio próprio, se tiver. Não precisa de URI de redirecionamento.
4. Copie o **ID do cliente** (termina em `.apps.googleusercontent.com`) e publique de novo:

   ```bash
   GOOGLE_CLIENT_ID=123-abc.apps.googleusercontent.com PROJECT_ID=seu-projeto ./deploy-gcp.sh
   ```

   Nas próximas publicações não precisa repetir o `GOOGLE_CLIENT_ID`: ele fica guardado no Cloud Run.

Como funciona: na primeira entrada com o Google o app pede o código do desafio. Se já existir uma conta com o mesmo e-mail, ela é ligada ao Google. Quem entrou pelo Google pode criar uma senha depois, no perfil.

**Domínio próprio (opcional):** no Cloud Run → serviço → *Gerenciar domínios personalizados* (ex.: `desafio.mooh.com.br`).

## Instalando no celular

- **iPhone (Safari):** abra o link → **Compartilhar** → **Adicionar à Tela de Início**.
- **Android (Chrome):** abra o link → menu **⋮** → **Instalar app**.

## Estrutura

```
desafio21/
├── server.js            # ponto de entrada
├── src/app.js           # API (Express) e regras de acesso
├── src/db.js            # banco: PostgreSQL (Cloud SQL) ou SQLite local
├── src/storage.js       # fotos: Cloud Storage ou pasta local
├── src/challenge.js     # conteúdo inicial dos 21 dias, pontos e premiação
├── public/              # front-end (SPA sem build) + PWA (manifest, service worker, ícones)
├── deploy-gcp.sh        # publicação no Google Cloud
├── Dockerfile
├── scripts/make-icons.js
└── test/api.test.js
```
