const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');
const { professionalConverter } = require('./converter');

const app = express();
app.use(express.json()); // parse JSON bodies for /convert
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const targetVideo = 'video1.mp4';
const videoId = path.parse(targetVideo).name;
professionalConverter(targetVideo);

// Allow cross-origin requests for HLS assets (used by the Flask live page at a different origin)
app.use('/stream', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
}, express.static(path.join(__dirname, 'live')));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// Broadcast endpoint so other servers (e.g., Flask) can forward messages to socket rooms
app.post('/broadcast', (req, res) => {
    try {
        const { room, user, message, id } = req.body;
        if (!room || !message) return res.status(400).json({ error: 'room and message required' });
        // include id if present so clients can dedupe
        const payload = { user, message };
        if (id) payload.id = id;
        if (!liveStats[room]) liveStats[room] = { totalMessages: 0, peakViewers: 0, currentViewers: 0, qualitySwitches: [] };
        liveStats[room].totalMessages = (liveStats[room].totalMessages || 0) + 1;
        io.to(room).emit('new-message', payload);
        io.to(room).emit('stats-update', liveStats[room]);
        console.log(`[Broadcast] ${user || 'anon'} -> ${room}: ${message}`);
        return res.json({ ok: true });
    } catch (e) {
        console.error('[Broadcast] error', e);
        return res.status(500).json({ error: e.message });
    }
});

// Endpoint to trigger conversion for uploaded videos
app.post('/convert', async (req, res) => {
    const filename = req.body && req.body.filename;
    const sourceUrl = req.body && req.body.sourceUrl; // optional
    const room = req.body && req.body.room; // optional room name to publish metadata

    if (!filename) return res.status(400).json({ error: 'filename required' });

    const videosDir = path.join(__dirname, 'videos');
    if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir, { recursive: true });

    const destPath = path.join(videosDir, filename);

    try {
        // If sourceUrl is provided, download file into videos dir
        if (sourceUrl) {
            console.log(`[Convert] Downloading ${sourceUrl} to ${destPath}`);
            await new Promise((resolve, reject) => {
                const proto = sourceUrl.startsWith('https') ? require('https') : require('http');
                const file = fs.createWriteStream(destPath);
                proto.get(sourceUrl, (response) => {
                    if (response.statusCode !== 200) return reject(new Error('Failed to download file: ' + response.statusCode));
                    response.pipe(file);
                    file.on('finish', () => file.close(resolve));
                }).on('error', (err) => {
                    fs.unlink(destPath, () => {});
                    reject(err);
                });
            });
        }

        // ensure file exists
        if (!fs.existsSync(destPath)) return res.status(404).json({ error: 'file not found on server videos folder' });

        // run converter and wait for completion
        professionalConverter(filename).then((stats) => {
            console.log(`[Convert] Completed conversion for ${filename}`, stats);
            // if a room name was provided, move the output directory to match the room
            const originalDir = path.join(__dirname, 'live', stats.outputDir);
            const targetDir = room ? path.join(__dirname, 'live', room) : originalDir;

            try {
                if (room && fs.existsSync(originalDir)) {
                    // remove target if exists
                    if (fs.existsSync(targetDir)) {
                        fs.rmSync(targetDir, { recursive: true, force: true });
                    }
                    fs.renameSync(originalDir, targetDir);
                }

                // read metadata and emit stats-update
                const metadataPath = path.join(targetDir, 'metadata.json');
                if (fs.existsSync(metadataPath)) {
                    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
                    const roomName = room || stats.outputDir;

                    // compute representative quality (max height)
                    let representative = null;
                    if (metadata.resolutions && Array.isArray(metadata.resolutions) && metadata.resolutions.length) {
                        const heights = metadata.resolutions.map(r => r.height || (r.name && parseInt(r.name.replace(/[^0-9]/g, '')))).filter(Boolean);
                        if (heights.length) representative = `${Math.max(...heights)}p`;
                    }

                    if (!liveStats[roomName]) liveStats[roomName] = { totalMessages: 0, peakViewers: 0, currentViewers: 0, qualitySwitches: [], averageQuality: representative };
                    liveStats[roomName] = { ...liveStats[roomName], ...metadata, averageQuality: representative };
                    io.to(roomName).emit('stats-update', liveStats[roomName]);
                }
            } catch (e) {
                console.error('[Convert] Post-process error', e);
            }
        }).catch((err) => {
            console.error('[Convert] Conversion failed', err);
        });

        console.log(`[Convert] Started conversion for ${filename}`);
        return res.json({ started: true });
    } catch (e) {
        console.error('[Convert] Error starting conversion', e);
        return res.status(500).json({ error: e.message });
    }
});

const liveStats = { [videoId]: { totalMessages: 0, peakViewers: 0, currentViewers: 0, qualitySwitches: [] } };

function updateMetadataFile(vid, data) {
    const filePath = path.join(__dirname, 'live', vid, 'metadata.json');
    if (fs.existsSync(filePath)) {
        try {
            let metadata = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            if (metadata.status === "Success") {
                metadata = { ...metadata, ...data };
                fs.writeFileSync(filePath, JSON.stringify(metadata, null, 4));
            }
        } catch (e) {}
    }
}

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
            updateMetadataFile(vid, { peakViewers: liveStats[vid].peakViewers });
        }
        socket._currentRoom = vid;
        // send the current stats to the joining socket
        socket.emit('stats-update', liveStats[vid]);
        // broadcast updated stats to all in room
        io.to(vid).emit('stats-update', liveStats[vid]);
    });

    socket.on('chat-message', (data) => {
        console.log(`[Socket.IO] chat-message from ${socket.id} to ${data.videoId}: ${data.message}`);
        if (!data || !data.videoId) return;
        if (!liveStats[data.videoId]) {
            liveStats[data.videoId] = { totalMessages: 0, peakViewers: 0, currentViewers: 0, qualitySwitches: [] };
        }
        // increment message count (we assume Flask stores the message; counting here keeps Node stats accurate)
        liveStats[data.videoId].totalMessages = (liveStats[data.videoId].totalMessages || 0) + 1;
        updateMetadataFile(data.videoId, { totalMessages: liveStats[data.videoId].totalMessages });
        const payload = { user: socket.id.substr(0, 5), message: data.message };
        if (data.id) payload.id = data.id;
        io.to(data.videoId).emit('new-message', payload);
        io.to(data.videoId).emit('stats-update', liveStats[data.videoId]);
    });

    socket.on('quality-log', (data) => {
        console.log('[Socket.IO] quality-log', data);
        if (!data || !data.videoId) return;
        if (!liveStats[data.videoId]) {
            liveStats[data.videoId] = { totalMessages: 0, peakViewers: 0, currentViewers: 0, qualitySwitches: [] };
        }
        liveStats[data.videoId].qualitySwitches.push(data.quality);
        const arr = liveStats[data.videoId].qualitySwitches;
        const avg = Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
        liveStats[data.videoId].averageQuality = `${avg}p`;
        io.to(data.videoId).emit('stats-update', liveStats[data.videoId]);
        updateMetadataFile(data.videoId, { averageQuality: liveStats[data.videoId].averageQuality });
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

httpServer.listen(3000, () => console.log("Server running on http://localhost:3000"));