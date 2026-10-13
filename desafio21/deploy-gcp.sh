#!/usr/bin/env bash
# Publica o Desafio 21 Dias no Google Cloud:
#   Cloud Run (app) + Cloud SQL PostgreSQL (banco) + Cloud Storage (fotos) + Secret Manager (senha do banco).
# Rode no Cloud Shell (console.cloud.google.com → ícone ">_"), dentro da pasta desafio21:
#   PROJECT_ID=meu-projeto ./deploy-gcp.sh
# Pode ser executado de novo para publicar uma nova versão: o que já existe é reaproveitado.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?Defina PROJECT_ID, ex.: PROJECT_ID=meu-projeto ./deploy-gcp.sh}"
REGION="${REGION:-southamerica-east1}"          # São Paulo
SERVICE="${SERVICE:-desafio21}"
INSTANCE="${INSTANCE:-desafio21-db}"
DB_NAME="${DB_NAME:-desafio21}"
DB_USER="${DB_USER:-desafio}"
BUCKET="${BUCKET:-${PROJECT_ID}-desafio21-fotos}"
JOIN_CODE="${JOIN_CODE:-MOOH21}"
GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-}"   # opcional: ativa o botão "Continuar com Google" (veja o README)
SA_NAME="${SERVICE}-run"
SA="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
SECRET="${SERVICE}-database-url"

gcloud config set project "$PROJECT_ID" >/dev/null

BILLING="$(gcloud billing projects describe "$PROJECT_ID" --format='value(billingEnabled)' 2>/dev/null || true)"
if [ "$BILLING" = "False" ]; then
  echo "O projeto $PROJECT_ID não tem faturamento ativo. Vincule a conta de faturamento com os créditos em:"
  echo "  https://console.cloud.google.com/billing/linkedaccount?project=$PROJECT_ID"
  exit 1
fi

echo "==> Ativando APIs (pode levar alguns minutos na primeira vez)"
gcloud services enable --quiet run.googleapis.com sqladmin.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com storage.googleapis.com

echo "==> Banco de dados Cloud SQL (PostgreSQL 16)"
if ! gcloud sql instances describe "$INSTANCE" >/dev/null 2>&1; then
  # db-f1-micro: menor máquina, suficiente para algumas centenas de alunos. Leva ~10 minutos.
  gcloud sql instances create "$INSTANCE" --database-version=POSTGRES_16 --edition=enterprise \
    --tier=db-f1-micro --region="$REGION" --storage-size=10 --storage-auto-increase \
    --backup-start-time=06:00
fi
gcloud sql databases describe "$DB_NAME" --instance="$INSTANCE" >/dev/null 2>&1 \
  || gcloud sql databases create "$DB_NAME" --instance="$INSTANCE"
CONN="$(gcloud sql instances describe "$INSTANCE" --format='value(connectionName)')"

if ! gcloud secrets describe "$SECRET" >/dev/null 2>&1; then
  DB_PASS="$(openssl rand -hex 24)"
  gcloud sql users create "$DB_USER" --instance="$INSTANCE" --password="$DB_PASS" 2>/dev/null \
    || gcloud sql users set-password "$DB_USER" --instance="$INSTANCE" --password="$DB_PASS"
  printf 'postgresql://%s:%s@/%s?host=/cloudsql/%s' "$DB_USER" "$DB_PASS" "$DB_NAME" "$CONN" \
    | gcloud secrets create "$SECRET" --data-file=- --replication-policy=automatic
fi

echo "==> Bucket privado para as fotos"
gcloud storage buckets describe "gs://$BUCKET" >/dev/null 2>&1 \
  || gcloud storage buckets create "gs://$BUCKET" --location="$REGION" \
       --uniform-bucket-level-access --public-access-prevention

echo "==> Conta de serviço e permissões"
gcloud iam service-accounts describe "$SA" >/dev/null 2>&1 \
  || gcloud iam service-accounts create "$SA_NAME" --display-name="Desafio 21 Dias (Cloud Run)"
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$SA" \
  --role=roles/cloudsql.client --condition=None >/dev/null
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" --member="serviceAccount:$SA" \
  --role=roles/storage.objectAdmin >/dev/null
gcloud secrets add-iam-policy-binding "$SECRET" --member="serviceAccount:$SA" \
  --role=roles/secretmanager.secretAccessor >/dev/null

# Projetos novos: o build do Cloud Run usa a conta de serviço padrão do Compute Engine,
# que às vezes não recebe as permissões automaticamente.
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role=roles/run.builder --condition=None >/dev/null 2>&1 || true

# --update-env-vars mantém as variáveis já configuradas (ex.: GOOGLE_CLIENT_ID de uma publicação anterior)
ENV_VARS="GCS_BUCKET=$BUCKET,JOIN_CODE=$JOIN_CODE,TZ_CHALLENGE=America/Sao_Paulo"
[ -n "$GOOGLE_CLIENT_ID" ] && ENV_VARS="$ENV_VARS,GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID"

echo "==> Publicando no Cloud Run (o build leva alguns minutos)"
gcloud run deploy "$SERVICE" --source . --region="$REGION" --quiet \
  --service-account="$SA" \
  --add-cloudsql-instances="$CONN" \
  --update-env-vars="$ENV_VARS" \
  --set-secrets="DATABASE_URL=$SECRET:latest" \
  --allow-unauthenticated --memory=512Mi --min-instances=0 --max-instances=4

echo
echo "Pronto! Endereço do app:"
gcloud run services describe "$SERVICE" --region="$REGION" --format='value(status.url)'
echo "Crie primeiro a conta do personal (a primeira conta vira administradora) e depois passe o código $JOIN_CODE aos alunos."
