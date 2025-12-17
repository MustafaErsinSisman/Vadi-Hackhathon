const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');
const { professionalConverter } = require('./converter');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer);

const targetVideo = 'video1.mp4';
const videoId = path.parse(targetVideo).name;
professionalConverter(targetVideo);

app.use('/stream', express.static(path.join(__dirname, 'live')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

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
    socket.on('join-room', (vid) => {
        socket.join(vid);
        if (liveStats[vid]) {
            liveStats[vid].currentViewers++;
            if (liveStats[vid].currentViewers > liveStats[vid].peakViewers) {
                liveStats[vid].peakViewers = liveStats[vid].currentViewers;
                updateMetadataFile(vid, { peakViewers: liveStats[vid].peakViewers });
            }
        }
    });

    socket.on('chat-message', (data) => {
        if (liveStats[data.videoId]) {
            liveStats[data.videoId].totalMessages++;
            updateMetadataFile(data.videoId, { totalMessages: liveStats[data.videoId].totalMessages });
        }
        io.to(data.videoId).emit('new-message', { user: socket.id.substr(0, 5), message: data.message });
    });

    socket.on('quality-log', (data) => {
        if (liveStats[data.videoId]) {
            liveStats[data.videoId].qualitySwitches.push(data.quality);
            const avg = (liveStats[data.videoId].qualitySwitches.reduce((a, b) => a + b, 0) / liveStats[data.videoId].qualitySwitches.length).toFixed(0);
            updateMetadataFile(data.videoId, { averageQuality: `${avg}p` });
        }
    });

    socket.on('disconnect', () => { if (liveStats[videoId]) liveStats[videoId].currentViewers--; });
});

httpServer.listen(3000, () => console.log("Server running on http://localhost:3000"));