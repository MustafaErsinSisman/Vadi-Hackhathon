#!/bin/bash

echo "🎬 Video Upload Platform Kurulumu Başlatılıyor..."

# Gerekli Python paketleri
pip install flask flask-cors

# FFmpeg kurulumu
if ! command -v ffmpeg &> /dev/null; then
    echo "FFmpeg kuruluyor..."
    
    # Ubuntu/Debian
    if command -v apt-get &> /dev/null; then
        sudo apt-get update
        sudo apt-get install -y ffmpeg
    
    # MacOS
    elif command -v brew &> /dev/null; then
        brew install ffmpeg
    
    else
        echo "Lütfen manuel olarak FFmpeg kurun: https://ffmpeg.org/download.html"
        exit 1
    fi
fi

echo "✅ FFmpeg kuruldu: $(ffmpeg -version | head -1)"

# Klasörleri oluştur
mkdir -p uploads/chunks uploads/videos uploads/thumbnails data static/thumbnails

# Config dosyası oluştur
cat > config.json << EOF
{
    "max_file_size": 2147483648,
    "chunk_size": 5242880,
    "allowed_extensions": ["mp4", "avi", "mov", "mkv", "webm"],
    "ffmpeg_path": "$(which ffmpeg)",
    "ffprobe_path": "$(which ffprobe)"
}
EOF

echo ""
echo "✅ Kurulum tamamlandı!"
echo ""
echo "🚀 Çalıştırmak için:"
echo "1. Python sunucusu: python mock-server.py"
echo "2. Tarayıcıda index.html dosyasını açın"
echo ""
echo "📁 Klasör yapısı:"
echo "   uploads/chunks/    - Parçalanmış dosyalar"
echo "   uploads/videos/    - İşlenmiş videolar"
echo "   uploads/thumbnails/- Thumbnail'lar"
echo "   data/             - Veritabanı dosyaları"
