
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

async function professionalConverter(fileName) {
    const inputPath = path.join(__dirname, 'videos', fileName);
    const outputBaseDir = path.join(__dirname, 'live', path.parse(fileName).name);

    ffmpeg.ffprobe(inputPath, (err, metadata) => {
        if (err) return console.error("ERROR: Video analysis failed:", err);

        const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
        const height = videoStream.height;
        const selectedQualities = QUALITY_LIBRARY.filter(q => q.height <= height);

        let command = ffmpeg(inputPath);

        selectedQualities.forEach(quality => {
            const qualityDir = path.join(outputBaseDir, quality.name);
            if (!fs.existsSync(qualityDir)) fs.mkdirSync(qualityDir, { recursive: true });

            command = command
                .output(path.join(qualityDir, `${quality.name}.m3u8`))
                .size(`${quality.width}x${quality.height}`)
                .videoBitrate(quality.bitrate)
                .addOptions([
                    `-profile:v ${quality.profile}`,
                    `-level ${quality.level}`,
                    '-hls_time 6',
                    '-hls_list_size 0',
                    '-f hls'
                ]);
        });

        command
            .on('error', (ffmpegErr) => console.error("ERROR:", ffmpegErr.message))
            .on('end', () => {
                let masterContent = "#EXTM3U\n#EXT-X-VERSION:3\n";

                selectedQualities.forEach(quality => {
                    masterContent += `#EXT-X-STREAM-INF:BANDWIDTH=${quality.bandwidth},RESOLUTION=${quality.width}x${quality.height}\n`;
                    masterContent += `${quality.name}/${quality.name}.m3u8\n`;
                });

                fs.writeFileSync(path.join(outputBaseDir, 'master.m3u8'), masterContent);
            })
            .run();
    });
}

//professionalConverter('video1.mp4');
module.exports = { professionalConverter };