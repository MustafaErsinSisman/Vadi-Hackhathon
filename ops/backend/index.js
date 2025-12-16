const express = require('express');
const app = express();
const port = 3000;

// Basit bir endpoint
app.get('/', (req, res) => {
  res.json({ message: 'Backend Docker içinden selamlar! Case 5 Altyapısı Hazır.' });
});

// Prometheus için metrik endpointi (DevOps puanı kazandırır)
app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send('# HELP video_upload_count Total videos uploaded\n# TYPE video_upload_count counter\nvideo_upload_count 0\n');
});

app.listen(port, () => {
  console.log(`Backend ${port} portunda çalışıyor.`);
});