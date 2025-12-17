const { createClient } = require('redis');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
// Prisma kütüphanesini ekledik
const { PrismaClient } = require('@prisma/client');

// Veritabanı istemcisini başlat
const prisma = new PrismaClient();

// Docker içindeki Redis'e bağlan
const client = createClient({
    url: 'redis://redis:6379'
});

async function startWorker() {
    try {
        await client.connect();
        console.log("👷 Worker iş başı yaptı! Redis kuyruğu dinleniyor...");

        // Sonsuz döngü: Sürekli iş bekle
        while (true) {
            try {
                // 'video_queue' listesinden veri al
                const submission = await client.brPop('video_queue', 0);
                const message = JSON.parse(submission.element);
                
                // Log mesajını güncelledik: Artık ID'yi de yazıyor
                console.log(`📦 Yeni iş alındı: ${message.filename} (ID: ${message.id})`);
                
                await processVideo(message);

            } catch (err) {
                console.error("İş alma hatası:", err);
            }
        }

    } catch (err) {
        console.error("Redis bağlantı hatası:", err);
    }
}

async function processVideo(jobData) {
    const inputPath = path.join('/app/uploads', jobData.filename);
    const outputFilename = `thumbnail_${jobData.filename}.png`;
    const outputPath = path.join('/app/uploads', outputFilename);

    console.log(`⚙️ FFmpeg çalışıyor... Hedef: ${outputPath}`);

    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .screenshots({
                timestamps: ['50%'], // Videonun tam ortasından resim al
                filename: outputFilename,
                folder: '/app/uploads',
                size: '320x240'
            })
            .on('end', async () => {
                console.log(`✅ İşlem Tamamlandı! Thumbnail oluşturuldu: ${outputFilename}`);
                
                // --- YENİ EKLENEN KISIM: VERİTABANI GÜNCELLEME ---
                if (jobData.id) {
                    try {
                        await prisma.video.update({
                            where: { id: jobData.id },
                            data: { status: 'COMPLETED' }
                        });
                        console.log(`💾 Veritabanı güncellendi: ${jobData.id} -> COMPLETED`);
                    } catch (dbError) {
                        console.error("⚠️ Veritabanı güncelleme hatası:", dbError);
                    }
                }
                // -------------------------------------------------

                resolve();
            })
            .on('error', (err) => {
                console.error('❌ FFmpeg Hatası:', err);
                reject(err);
            });
    });
}

startWorker();