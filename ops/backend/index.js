const express = require('express');
const multer = require('multer');
const { createClient } = require('redis');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http'); 
const { Server } = require('socket.io'); 
const { PrismaClient } = require('@prisma/client');

const app = express();
const port = 3000;

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: '*', 
        methods: ['GET', 'POST']
    }
});

const prisma = new PrismaClient();
app.use(cors());
app.use(express.json());

// Yeni eklenen kısım: Frontend dosyalarını sunmak için
app.use(express.static(path.join(__dirname, '../frontend'))); // ops/frontend klasörünü statik olarak sunarız

// Uploads klasörünü statik olarak aç (HLS Streaming için KRİTİK)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const redisClient = createClient({
    url: 'redis://redis:6379'
});

(async () => {
    await redisClient.connect();
    console.log('Redis bağlantısı başarılı! 🔴');
})();

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

const liveStats = {};

io.on('connection', (socket) => {
    console.log('[Socket.IO] Client connected', socket.id);

    socket.on('join-room', (vid) => {
        console.log(`[Socket.IO] join-room: ${vid} (socket ${socket.id})`);
        socket.join(vid);
        
        if (!liveStats[vid]) {
            liveStats[vid] = { totalMessages: 0, peakViewers: 0, currentViewers: 0, qualitySwitches: [] };
        }
        liveStats[vid].currentViewers++;
        
        if (liveStats[vid].currentViewers > liveStats[vid].peakViewers) {
            liveStats[vid].peakViewers = liveStats[vid].currentViewers;
        }
        
        socket._currentRoom = vid;
        
        socket.emit('stats-update', liveStats[vid]);
        io.to(vid).emit('stats-update', liveStats[vid]);
    });

    socket.on('chat-message', (data) => {
        console.log(`[Socket.IO] chat-message: ${data.message} (Room: ${data.videoId})`);
        if (!data || !data.videoId) return;

        if (!liveStats[data.videoId]) {
            liveStats[data.videoId] = { totalMessages: 0, peakViewers: 0, currentViewers: 0, qualitySwitches: [] };
        }
        
        liveStats[data.videoId].totalMessages = (liveStats[data.videoId].totalMessages || 0) + 1;
        
        const payload = { 
            user: socket.id.substr(0, 5), 
            message: data.message,
            timestamp: new Date().toISOString()
        };
        
        if (data.id) payload.id = data.id;

        io.to(data.videoId).emit('new-message', payload);
        io.to(data.videoId).emit('stats-update', liveStats[data.videoId]);
    });

    socket.on('quality-log', (data) => {
        if (!data || !data.videoId) return;
        if (!liveStats[data.videoId]) {
            liveStats[data.videoId] = { totalMessages: 0, peakViewers: 0, currentViewers: 0, qualitySwitches: [] };
        }
        liveStats[data.videoId].qualitySwitches.push(data.quality);
    });

    socket.on('disconnect', () => {
        console.log('[Socket.IO] Client disconnected', socket.id);
        const vid = socket._currentRoom;
        if (vid && liveStats[vid]) {
            liveStats[vid].currentViewers = Math.max(0, liveStats[vid].currentViewers - 1);
            io.to(vid).emit('stats-update', liveStats[vid]);
        }
    });
});

app.get('/', (req, res) => {
    // Kök URL'ye gelen isteklerde ops/frontend/index.html dosyasını gönder
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.post('/upload', upload.single('video'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Lütfen bir video dosyası yükleyin.' });
        }

        console.log(`🎥 Yeni video yüklendi: ${req.file.filename}`);
        
        const newVideo = await prisma.video.create({
            data: {
                filename: req.file.filename,
                status: 'PENDING'
            }
        });

        console.log(`💾 Veritabanına yazıldı ID: ${newVideo.id}`);

        const jobData = {
            id: newVideo.id, 
            filename: req.file.filename,
            originalName: req.file.originalname,
            path: req.file.path,
            uploadDate: new Date().toISOString()
        };
        
        await redisClient.lPush('video_queue', JSON.stringify(jobData));

        res.status(200).json({
            message: 'Video alındı, işleniyor...',
            filename: req.file.filename,
            jobId: newVideo.id,
            streamUrl: `/uploads/hls/${newVideo.id}/master.m3u8`
        });

    } catch (error) {
        console.error('Yükleme hatası:', error);
        res.status(500).json({ error: 'Sunucu hatası oluştu.' });
    }
});

httpServer.listen(port, () => {
    console.log(`Backend API & Socket.IO ${port} portunda istekleri bekliyor.`);
});