const { createClient } = require('redis');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const client = createClient({
    url: 'redis://redis:6379'
});

const QUALITY_LIBRARY = [
    { name: '144p',  width: 256,  height: 144,  bitrate: '200k',  profile: 'baseline', level: '3.0', bandwidth: 200000 },
    { name: '240p',  width: 426,  height: 240,  bitrate: '400k',  profile: 'baseline', level: '3.0', bandwidth: 400000 },
    { name: '480p',  width: 854,  height: 480,  bitrate: '1200k', profile: 'main',     level: '3.1', bandwidth: 1200000 },
    { name: '720p',  width: 1280, height: 720,  bitrate: '2800k', profile: 'main',     level: '3.1', bandwidth: 2800000 },
    { name: '1080p', width: 1920, height: 1080, bitrate: '5000k', profile: 'high',     level: '4.1', bandwidth: 5000000 }
];

async function startWorker() {
    try {
        await client.connect();
        console.log("👷 Worker (Enhanced) iş başı yaptı! Redis kuyruğu dinleniyor...");

        while (true) {
            try {
                const submission = await client.brPop('video_queue', 0);
                const message = JSON.parse(submission.element);
                
                console.log(`📦 Yeni iş alındı: ${message.filename} (ID: ${message.id})`);
                
                // Önce thumbnail oluştur (Eski özellik korunuyor)
                await generateThumbnail(message);
                
                // Sonra HLS dönüşümü başlat (Yeni özellik)
                await processVideoHLS(message);

                // İşlem tamamlanınca DB güncelle
                if (message.id) {
                    try {
                        await prisma.video.update({
                            where: { id: message.id },
                            data: { status: 'COMPLETED' }
                        });
                        console.log(`💾 Veritabanı güncellendi: ${message.id} -> COMPLETED`);
                    } catch (dbError) {
                        console.error("⚠️ Veritabanı güncelleme hatası:", dbError);
                    }
                }

            } catch (err) {
                console.error("İş alma hatası:", err);
            }
        }

    } catch (err) {
        console.error("Redis bağlantı hatası:", err);
    }
}

async function generateThumbnail(jobData) {
    const inputPath = path.join('/app/uploads', jobData.filename);
    const outputFilename = `thumbnail_${jobData.filename}.png`;
    // const outputPath = path.join('/app/uploads', outputFilename); // Kullanılmıyor, yorum satırı.

    console.log(`📸 Thumbnail oluşturuluyor...`);

    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .screenshots({
                timestamps: ['50%'],
                filename: outputFilename,
                folder: '/app/uploads',
                size: '320x240'
            })
            .on('end', () => {
                console.log(`✅ Thumbnail tamamlandı.`);
                resolve();
            })
            .on('error', (err) => {
                console.error('❌ Thumbnail Hatası:', err);
                // Thumbnail hatası tüm işlemi durdurmasın diye resolve ediyoruz, ama logluyoruz.
                resolve(); 
            });
    });
}

function processVideoHLS(jobData) {
    return new Promise((resolve, reject) => {
        const inputPath = path.join('/app/uploads', jobData.filename);
        // HLS çıktılarını video ID'sine göre bir klasöre koyalım
        // Önemli düzeltme: ID varsa klasör adı ID olsun, yoksa dosya adı.
        // Arkadaşın kodunda bu dinamikti, ama DB ile uyum için ID daha güvenli.
        const dirName = jobData.id || jobData.filename.replace(path.extname(jobData.filename), '');
        const outputBaseDir = path.join('/app/uploads', 'hls', dirName); 

        if (!fs.existsSync(outputBaseDir)) fs.mkdirSync(outputBaseDir, { recursive: true });

        console.log(`⚙️ HLS Dönüşümü başlıyor... Hedef: ${outputBaseDir}`);

        ffmpeg.ffprobe(inputPath, (err, metadata) => {
            if (err) {
                console.error("❌ FFprobe Hatası:", err);
                return reject(err);
            }

            const videoStream = metadata.streams.find(s => s.codec_type === 'video');
            if (!videoStream) {
                 console.error("❌ Video stream bulunamadı.");
                 return reject(new Error("No video stream found"));
            }

            const selectedQualities = QUALITY_LIBRARY.filter(q => q.height <= videoStream.height);

            let command = ffmpeg(inputPath);
            
            selectedQualities.forEach(quality => {
                const qualityDir = path.join(outputBaseDir, quality.name);
                if (!fs.existsSync(qualityDir)) fs.mkdirSync(qualityDir, { recursive: true });

                command = command.output(path.join(qualityDir, `${quality.name}.m3u8`))
                    .size(`${quality.width}x${quality.height}`)
                    .videoBitrate(quality.bitrate)
                    .addOptions([
                        '-profile:v ' + quality.profile, 
                        '-level ' + quality.level, 
                        '-hls_time 6', 
                        '-hls_list_size 0', 
                        '-f hls'
                    ]);
            });

            command
                .on('start', () => console.log(`🎬 FFmpeg başladı: ${jobData.filename}`))
                .on('error', (ffmpegErr) => {
                    console.error('❌ FFmpeg HLS Hatası:', ffmpegErr);
                    reject(ffmpegErr);
                })
                .on('end', () => {
                    // Master playlist oluştur
                    let masterContent = "#EXTM3U\n#EXT-X-VERSION:3\n";
                    selectedQualities.forEach(q => {
                        // Göreceli yollar (Frontend için önemli)
                        masterContent += `#EXT-X-STREAM-INF:BANDWIDTH=${q.bandwidth},RESOLUTION=${q.width}x${q.height}\n${q.name}/${q.name}.m3u8\n`;
                    });
                    fs.writeFileSync(path.join(outputBaseDir, 'master.m3u8'), masterContent);
                    
                    console.log(`✅ HLS Dönüşümü tamamlandı: ${jobData.filename}`);
                    resolve();
                })
                .run();
        });
    });
}

startWorker();
