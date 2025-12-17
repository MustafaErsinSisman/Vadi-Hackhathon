const express = require('express');
const multer = require('multer');
const { createClient } = require('redis');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
// YENİ: Prisma'yı çağırdık
const { PrismaClient } = require('@prisma/client');

const app = express();
const port = 3000;

// YENİ: Veritabanı bağlantısını başlat
const prisma = new PrismaClient();

// 1. CORS
app.use(cors());

// 2. Redis Bağlantısı
const redisClient = createClient({
    url: 'redis://redis:6379'
});

(async () => {
    await redisClient.connect();
    console.log('Redis bağlantısı başarılı! 🔴');
})();

// 3. Dosya Yükleme Ayarları
const uploadDir = 'uploads/';
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = uuidv4() + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({ storage: storage });

// --- ENDPOINTLER ---

app.get('/', (req, res) => {
    res.json({ status: 'OK', message: 'Video API Hazır ve Çalışıyor 🚀' });
});

// VİDEO YÜKLEME
app.post('/upload', upload.single('video'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Lütfen bir video dosyası yükleyin.' });
        }

        console.log(`🎥 Yeni video yüklendi: ${req.file.filename}`);

        // --- DEĞİŞEN KISIM BURASI (Veritabanı Eklendi) ---
        
        // 1. Önce Veritabanına "PENDING" olarak kaydet
        const newVideo = await prisma.video.create({
            data: {
                filename: req.file.filename,
                status: 'PENDING'
            }
        });

        console.log(`💾 Veritabanına yazıldı ID: ${newVideo.id}`);

        // 2. Redis Kuyruğuna İş Emri Ekle (ID ile birlikte!)
        const jobData = {
            id: newVideo.id, // <--- ARTIK ID GÖNDERİYORUZ
            filename: req.file.filename,
            originalName: req.file.originalname,
            path: req.file.path,
            uploadDate: new Date().toISOString()
        };
        
        await redisClient.lPush('video_queue', JSON.stringify(jobData));

        res.status(200).json({
            message: 'Video başarıyla alındı ve işleme sırasına eklendi.',
            filename: req.file.filename,
            jobId: newVideo.id
        });

    } catch (error) {
        console.error('Yükleme hatası:', error);
        res.status(500).json({ error: 'Sunucu hatası oluştu.' });
    }
});

app.listen(port, () => {
    console.log(`Backend API ${port} portunda istekleri bekliyor.`);
});