
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');

const QUALITY_LIBRARY = [
    { name: '144p',  width: 256,  height: 144,  bitrate: '200k',  profile: 'baseline', level: '3.0', bandwidth: 200000 },
    { name: '240p',  width: 426,  height: 240,  bitrate: '400k',  profile: 'baseline', level: '3.0', bandwidth: 400000 },
    { name: '480p',  width: 854,  height: 480,  bitrate: '1200k', profile: 'main',     level: '3.1', bandwidth: 1200000 },
    { name: '720p',  width: 1280, height: 720,  bitrate: '2800k', profile: 'main',     level: '3.1', bandwidth: 2800000 },
    { name: '1080p', width: 1920, height: 1080, bitrate: '5000k', profile: 'high',     level: '4.1', bandwidth: 5000000 }
];

function getDirectorySize(dirPath) {
    let size = 0;
    if (!fs.existsSync(dirPath)) return 0;
    const files = fs.readdirSync(dirPath);
    files.forEach(file => {
        const filePath = path.join(dirPath, file);
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) size += getDirectorySize(filePath);
        else size += stats.size;
    });
    return size;
}

async function professionalConverter(fileName) {
    const startTime = Date.now();
    const inputPath = path.join(__dirname, 'videos', fileName);
    const outputBaseDir = path.join(__dirname, 'live', path.parse(fileName).name);

    if (!fs.existsSync(outputBaseDir)) fs.mkdirSync(outputBaseDir, { recursive: true });

    ffmpeg.ffprobe(inputPath, (err, metadata) => {
        if (err) {
            fs.writeFileSync(path.join(outputBaseDir, 'metadata.json'), JSON.stringify({ status: "Failed", error: "Analysis Error" }));
            return console.error("ERROR: Video analysis failed:", err);
        }

        const videoStream = metadata.streams.find(s => s.codec_type === 'video');
        const selectedQualities = QUALITY_LIBRARY.filter(q => q.height <= videoStream.height);

        let command = ffmpeg(inputPath);
        selectedQualities.forEach(quality => {
            const qualityDir = path.join(outputBaseDir, quality.name);
            if (!fs.existsSync(qualityDir)) fs.mkdirSync(qualityDir, { recursive: true });

            command = command.output(path.join(qualityDir, `${quality.name}.m3u8`))
                .size(`${quality.width}x${quality.height}`)
                .videoBitrate(quality.bitrate)
                .addOptions(['-profile:v ' + quality.profile, '-level ' + quality.level, '-hls_time 6', '-hls_list_size 0', '-f hls']);
        });

        command
            .on('start', () => console.log(`Started: ${fileName}`))
            .on('error', (ffmpegErr) => {
                fs.writeFileSync(path.join(outputBaseDir, 'metadata.json'), JSON.stringify({ status: "Failed", error: ffmpegErr.message }));
            })
            .on('end', () => {
                const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
                let masterContent = "#EXTM3U\n#EXT-X-VERSION:3\n";
                selectedQualities.forEach(q => {
                    masterContent += `#EXT-X-STREAM-INF:BANDWIDTH=${q.bandwidth},RESOLUTION=${q.width}x${q.height}\n${q.name}/${q.name}.m3u8\n`;
                });
                fs.writeFileSync(path.join(outputBaseDir, 'master.m3u8'), masterContent);
                
                const stats = {
                    fileName,
                    originalDuration: `${metadata.format.duration.toFixed(2)}s`,
                    processingDuration: `${processingTime}s`,
                    totalOutputSize: `${(getDirectorySize(outputBaseDir) / (1024 * 1024)).toFixed(2)} MB`,
                    resolutions: selectedQualities.map(q => q.name),
                    completedAt: new Date().toISOString(),
                    status: "Success"
                };
                fs.writeFileSync(path.join(outputBaseDir, 'metadata.json'), JSON.stringify(stats, null, 4));
                console.log(`Finished: ${fileName}`);
            })
            .run();
    });
}

module.exports = { professionalConverter };