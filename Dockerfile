ARG NODE_IMAGE=node:22-alpine
ARG NGINX_IMAGE=nginx:stable-alpine
FROM ${NODE_IMAGE} AS build
ARG NPM_REGISTRY=https://registry.npmmirror.com
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY scripts/patch-monaco-word-highlighter.mjs ./scripts/
RUN npm ci --registry=${NPM_REGISTRY} --no-audit
COPY . .
RUN npm run build

FROM ${NGINX_IMAGE} AS release
COPY --from=build /app/build/ /app/
COPY w8t.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
