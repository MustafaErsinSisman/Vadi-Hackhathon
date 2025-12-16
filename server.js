const express = require('express');
const path = require('path');
const { professionalConverter } = require('./converter'); // Diğer dosyayı çağırdık

const app = express();

// 1. Videoyu dönüştürmeyi başlat (Dinamik olarak tetikleyebilirsin)
professionalConverter('video1.mp4');

// 2. Statik dosyaları sun
app.use('/live', express.static(path.join(__dirname, 'live')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(3000, () => console.log("Server: http://localhost:3000"));
