# 前端镜像：Node 多阶段构建产物 → Nginx 静态托管，并把 /api 反代到后端容器
FROM node:22-alpine AS build

# 国内/受限网络可覆盖：--build-arg NPM_REGISTRY=https://registry.npmmirror.com
ARG NPM_REGISTRY=https://registry.npmjs.org

WORKDIR /app

# 先复制 lockfile 与清单，最大化复用依赖层缓存
COPY package.json package-lock.json ./
# package-lock.json 里的 resolved 指向 registry.npmmirror.com，这里统一改写到指定 registry，
# 避免构建受单个镜像站波动影响（npmmirror 曾对个别包返回 500）
RUN npm config set registry "$NPM_REGISTRY" \
    && npm config set replace-registry-host always \
    && npm ci --no-audit --no-fund

COPY . .
RUN npm run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q --spider http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
