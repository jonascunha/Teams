FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production
# Cloud Run define PORT; o banco e as fotos vêm de DATABASE_URL e GCS_BUCKET.
CMD ["npm", "start"]
