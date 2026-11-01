#!/usr/bin/env bash
# Leva os dados do Cloud SQL para um PostgreSQL no Neon (plano gratuito) e troca o banco do app.
# Rode no Cloud Shell, dentro da pasta desafio21:
#   PROJECT_ID=meu-projeto ./migrar-para-neon.sh
# O script pede o endereço do Neon, copia e confere os dados, e só então troca o banco do app.
# O Cloud SQL não é apagado: fica como cópia de segurança até você decidir desligá-lo.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?Defina PROJECT_ID, ex.: PROJECT_ID=meu-projeto ./migrar-para-neon.sh}"
REGION="${REGION:-southamerica-east1}"
SERVICE="${SERVICE:-desafio21}"
SECRET="${SERVICE}-database-url"
PROXY_PORT=6543

gcloud config set project "$PROJECT_ID" >/dev/null

OLD_URL="$(gcloud secrets versions access latest --secret="$SECRET")"
if [[ ! "$OLD_URL" =~ ^postgresql://([^:]+):([^@]+)@/([^?]+)\?host=/cloudsql/(.+)$ ]]; then
  echo "O app não está usando o Cloud SQL (talvez a migração já tenha sido feita). Nada foi alterado."
  exit 1
fi
DB_USER="${BASH_REMATCH[1]}"; DB_PASS="${BASH_REMATCH[2]}"; DB_NAME="${BASH_REMATCH[3]}"; CONN="${BASH_REMATCH[4]}"

echo "Cole o endereço de conexão do Neon (começa com postgresql://) e aperte Enter."
echo "(Por segurança, o texto não aparece enquanto você cola.)"
read -rs NEON_URL
echo
if [[ ! "$NEON_URL" =~ ^postgres(ql)?:// ]]; then
  echo "Isso não parece um endereço do Neon. Copie de novo em Neon → Connect e rode o script outra vez."
  exit 1
fi
# O app precisa da conexão direta: a versão "pooled" (com -pooler no endereço) não serve para ele.
if [[ "$NEON_URL" == *"-pooler."* ]]; then
  NEON_URL="${NEON_URL/-pooler./.}"
  echo "Usando a conexão direta do Neon (sem -pooler)."
fi
echo "Destino: $(sed -E 's#^[^@]*@([^/?]*).*#\1#' <<<"$NEON_URL")"

echo "==> Preparando o acesso ao Cloud SQL"
PROXY="$(command -v cloud-sql-proxy || true)"
if [ -z "$PROXY" ]; then
  PROXY="$HOME/cloud-sql-proxy"
  curl -sSfLo "$PROXY" https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.14.1/cloud-sql-proxy.linux.amd64
  chmod +x "$PROXY"
fi
"$PROXY" --gcloud-auth --port "$PROXY_PORT" "$CONN" >/tmp/cloud-sql-proxy.log 2>&1 &
PROXY_PID=$!
trap 'kill $PROXY_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 30); do
  (echo >"/dev/tcp/127.0.0.1/$PROXY_PORT") 2>/dev/null && break
  sleep 1
done

[ -d node_modules/pg ] || npm ci --omit=dev --no-audit --no-fund

echo "==> Copiando os dados para o Neon"
node scripts/copy-db.js "postgresql://$DB_USER:$DB_PASS@127.0.0.1:$PROXY_PORT/$DB_NAME" "$NEON_URL"

echo "==> Trocando o banco do app (menos de 1 minuto)"
printf '%s' "$NEON_URL" | gcloud secrets versions add "$SECRET" --data-file=- >/dev/null
if ! gcloud run services update "$SERVICE" --region="$REGION" --quiet \
     --clear-cloudsql-instances --update-secrets="DATABASE_URL=$SECRET:latest"; then
  echo "O app não subiu com o Neon. Voltando para o Cloud SQL..."
  printf '%s' "$OLD_URL" | gcloud secrets versions add "$SECRET" --data-file=- >/dev/null
  gcloud run services update "$SERVICE" --region="$REGION" --quiet \
    --add-cloudsql-instances="$CONN" --update-secrets="DATABASE_URL=$SECRET:latest" || true
  echo "O app continua no Cloud SQL, como antes. Me mande as mensagens acima."
  exit 1
fi

URL="$(gcloud run services describe "$SERVICE" --region="$REGION" --format='value(status.url)')"
echo
echo "Pronto! O app agora usa o Neon: $URL"
echo "Abra o app, entre com a sua conta e confira se está tudo lá."
echo
echo "Quando tiver conferido, desligue o Cloud SQL para parar a cobrança (os dados ficam guardados):"
echo "  gcloud sql instances patch ${CONN##*:} --activation-policy=NEVER"
