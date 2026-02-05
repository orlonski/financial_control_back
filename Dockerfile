FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci
RUN npx prisma generate

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["node", "-e", "console.log('ENV:', JSON.stringify(process.env)); const { execSync } = require('child_process'); try { execSync('npm run deploy', {stdio: 'inherit'}); } catch(e) { console.error('FAILED:', e.message); process.exit(1); }"]
