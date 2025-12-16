const express = require('express');
const multer = require('multer');
const { createClient } = require('redis');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const port = 3000;

// 1. CORS: Frontend (React/Vue) rahatça erişsin diye
app.use(cors());

// 2. Redis Bağlantısı (Mesajlaşma için)
// Docker içinde olduğumuz için host: 'redis' yazıyoruz
const redisClient = createClient({
    url: 'redis://redis:6379'
});

(async () => {
    await redisClient.connect();
    console.log('Redis bağlantısı başarılı! 🔴');
})();

// 3. Dosya Yükleme Ayarları (Multer)
const uploadDir = 'uploads/';
// Klasör yoksa oluştur (Hata almamak için)
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir); // Videoları buraya kaydet
    },
    filename: (req, file, cb) => {
        // Dosya ismini benzersiz yap: "video.mp4" -> "550e8400-e29b... .mp4"
        const uniqueName = uuidv4() + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({ storage: storage });

// --- ENDPOINTLER ---

// Sağlık Kontrolü
app.get('/', (req, res) => {
    res.json({ status: 'OK', message: 'Video API Hazır ve Çalışıyor 🚀' });
});

// VİDEO YÜKLEME (Frontend buraya POST atacak)
app.post('/upload', upload.single('video'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Lütfen bir video dosyası yükleyin.' });
        }

        console.log(`🎥 Yeni video yüklendi: ${req.file.filename}`);

        // Redis Kuyruğuna İş Emri Ekle
        const jobData = {
            filename: req.file.filename,
            originalName: req.file.originalname,
            path: req.file.path,
            uploadDate: new Date().toISOString()
        };
        
        // 'video_queue' isimli listeye atıyoruz. Worker bunu dinleyecek.
        await redisClient.lPush('video_queue', JSON.stringify(jobData));

        res.status(200).json({
            message: 'Video başarıyla alındı ve işleme sırasına eklendi.',
            filename: req.file.filename,
            jobId: uuidv4()
        });

    } catch (error) {
        console.error('Yükleme hatası:', error);
        res.status(500).json({ error: 'Sunucu hatası oluştu.' });
    }
});

app.listen(port, () => {
    console.log(`Backend API ${port} portunda istekleri bekliyor.`);
});