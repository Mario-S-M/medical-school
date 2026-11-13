# API de la plataforma (NestJS). Imagen multietapa: compila, instala solo producción y corre sin privilegios.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY data ./data
COPY graphql ./graphql
COPY templates ./templates
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PUERTO||3000)+'/api/v1/salud').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
# Las migraciones se aplican antes de servir; si fallan, el contenedor no arranca.
CMD ["sh", "-c", "node dist/database/run-migrations.js && exec node dist/main.js"]
