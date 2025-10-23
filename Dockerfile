# 多阶段构建优化镜像大小
FROM node:18-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# 复制依赖文件
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# 构建阶段
FROM node:18-alpine AS builder
WORKDIR /app

# 复制依赖
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./

# 安装所有依赖（包括开发依赖）
RUN npm ci

# 复制项目文件
COPY . .

# 设置构建参数（可在构建时通过 --build-arg 传入）
ARG NEXT_PUBLIC_BASE_PATH=/xinsai-player
ARG NEXT_PUBLIC_DEBUG_SHOW_ANSWER=true

# 设置环境变量（构建时）
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV NEXT_PUBLIC_BASE_PATH=${NEXT_PUBLIC_BASE_PATH}
ENV NEXT_PUBLIC_DEBUG_SHOW_ANSWER=${NEXT_PUBLIC_DEBUG_SHOW_ANSWER}

# 构建 Next.js 应用
RUN npm run build

# 生产运行阶段
FROM node:18-alpine AS runner
WORKDIR /app

# 设置运行时参数（可在构建时通过 --build-arg 传入）
ARG NEXT_PUBLIC_BASE_PATH=/xinsai-player
ARG NEXT_PUBLIC_DEBUG_SHOW_ANSWER=true

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_BASE_PATH=${NEXT_PUBLIC_BASE_PATH}
ENV NEXT_PUBLIC_DEBUG_SHOW_ANSWER=${NEXT_PUBLIC_DEBUG_SHOW_ANSWER}

# 创建非 root 用户
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# 复制必要文件
COPY --from=builder /app/public ./public
COPY --from=builder /app/package*.json ./

# 自动创建 .next 目录的正确权限
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

# 启动应用
CMD ["node", "server.js"]

