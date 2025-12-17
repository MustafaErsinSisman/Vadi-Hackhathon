FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

# KRİTİK HAMLE: Prisma'yı Global Yükle
RUN npm install -g prisma

# Paketleri Yükle
RUN npm install

COPY . .

EXPOSE 3000

# Başlat
CMD ["npm", "start"]