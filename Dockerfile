# syntax=docker/dockerfile:1

FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG VITE_BASE_PATH=/xinsai-player
ARG NEXT_PUBLIC_BASE_PATH=/xinsai-player
ARG VITE_DEBUG_SHOW_ANSWER=false
ARG NEXT_PUBLIC_DEBUG_SHOW_ANSWER=false

ENV NODE_ENV=production
ENV VITE_BASE_PATH=${VITE_BASE_PATH}
ENV NEXT_PUBLIC_BASE_PATH=${NEXT_PUBLIC_BASE_PATH}
ENV VITE_DEBUG_SHOW_ANSWER=${VITE_DEBUG_SHOW_ANSWER}
ENV NEXT_PUBLIC_DEBUG_SHOW_ANSWER=${NEXT_PUBLIC_DEBUG_SHOW_ANSWER}

RUN npm run build

FROM nginx:1.27-alpine AS runner

COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 8080

ENV PORT=8080

CMD ["nginx", "-g", "daemon off;"]
