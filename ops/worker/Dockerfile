FROM mwader/static-ffmpeg:6.0 AS ffmpeg_source
FROM node:18-alpine

# FFmpeg araçlarını kopyala
COPY --from=ffmpeg_source /ffmpeg /usr/local/bin/
COPY --from=ffmpeg_source /ffprobe /usr/local/bin/

WORKDIR /app

COPY package*.json ./

# --- KRİTİK HAMLE: Prisma'yı Global Yükle (İzin sorununu aşar) ---
RUN npm install -g prisma

# Diğer paketleri yükle
RUN npm install

COPY . .

# Başlat
CMD ["npm", "start"]
