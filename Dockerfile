FROM node:18-alpine AS builder

WORKDIR /app

RUN apk add --no-cache curl

COPY package*.json ./
COPY tsconfig.json ./

RUN npm i && npm cache clean --force

COPY src ./src

RUN npm run build

FROM node:18-alpine AS production

WORKDIR /app

RUN apk add --no-cache curl

COPY package*.json ./

RUN npm i --only=production && npm cache clean --force

COPY --from=builder /app/dist ./dist

RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

USER nodejs

EXPOSE 3000

CMD ["npm", "start"]