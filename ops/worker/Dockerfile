# 1. Adım: Hazir FFmpeg imajini cagir (Burada her sey kurulu)
FROM mwader/static-ffmpeg:6.0 AS ffmpeg_source

# 2. Adım: Bizim Node.js imajina gec
FROM node:18-alpine

# 3. Adım: Hazir olan FFmpeg'i bizimkinin icine kopyala (Sihirli Kisim)
COPY --from=ffmpeg_source /ffmpeg /usr/local/bin/
COPY --from=ffmpeg_source /ffprobe /usr/local/bin/

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["npm", "start"]