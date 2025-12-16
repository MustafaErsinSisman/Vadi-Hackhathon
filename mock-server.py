from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import time
from datetime import datetime
from werkzeug.utils import secure_filename
import json

app = Flask(__name__)
CORS(app)  # CORS'u etkinleştir

# Yapılandırma
UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'mp4', 'avi', 'mov', 'mkv', 'webm'}
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB

# Klasörleri oluştur
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs('data', exist_ok=True)

# Dosya adı için izin verilen uzantılar
def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# Videoları saklamak için basit JSON veritabanı
VIDEOS_DB = 'data/videos.json'

def load_videos():
    if os.path.exists(VIDEOS_DB):
        with open(VIDEOS_DB, 'r', encoding='utf-8') as f:
            return json.load(f)
    return []

def save_videos(videos):
    with open(VIDEOS_DB, 'w', encoding='utf-8') as f:
        json.dump(videos, f, ensure_ascii=False, indent=2)

@app.route('/upload', methods=['POST'])
def upload_video():
    try:
        # Dosya kontrolü
        if 'video' not in request.files:
            return jsonify({'success': False, 'error': 'Dosya seçilmedi'}), 400
        
        file = request.files['video']
        
        if file.filename == '':
            return jsonify({'success': False, 'error': 'Dosya adı boş'}), 400
        
        if not allowed_file(file.filename):
            return jsonify({'success': False, 'error': 'İzin verilmeyen dosya türü'}), 400
        
        # Dosya boyutu kontrolü
        file.seek(0, 2)  # Dosyanın sonuna git
        file_size = file.tell()
        file.seek(0)  # Başa dön
        
        if file_size > MAX_FILE_SIZE:
            return jsonify({'success': False, 'error': 'Dosya boyutu çok büyük (max 100MB)'}), 400
        
        # Dosyayı kaydet
        filename = secure_filename(file.filename)
        file_path = os.path.join(UPLOAD_FOLDER, filename)
        file.save(file_path)
        
        # Video bilgilerini al
        title = request.form.get('title', 'İsimsiz Video')
        description = request.form.get('description', '')
        
        # Video bilgilerini veritabanına kaydet
        videos = load_videos()
        
        video_data = {
            'id': len(videos) + 1,
            'title': title,
            'description': description,
            'filename': filename,
            'path': file_path,
            'size': file_size,
            'uploaded': datetime.now().isoformat(),
            'views': 0
        }
        
        videos.append(video_data)
        save_videos(videos)
        
        return jsonify({
            'success': True,
            'message': 'Video başarıyla yüklendi',
            'video': video_data
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/videos', methods=['GET'])
def get_videos():
    try:
        videos = load_videos()
        return jsonify(videos)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/video/<int:video_id>', methods=['GET'])
def get_video(video_id):
    try:
        videos = load_videos()
        video = next((v for v in videos if v['id'] == video_id), None)
        
        if video:
            # Görüntülenme sayısını artır
            video['views'] += 1
            save_videos(videos)
            
            return jsonify(video)
        else:
            return jsonify({'error': 'Video bulunamadı'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/uploads/<filename>')
def serve_video(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)

@app.route('/')
def home():
    return jsonify({
        'name': 'Video Upload Mock Server',
        'status': 'running',
        'endpoints': {
            'GET /videos': 'Yüklenen videoları listeler',
            'POST /upload': 'Video yükler',
            'GET /video/<id>': 'Belirli bir videoyu getirir',
            'GET /uploads/<filename>': 'Video dosyasını sunar'
        }
    })

if __name__ == '__main__':
    print("""
    🎬 Video Upload Mock Server Başlatılıyor...
    
    📍 Endpointler:
      - Ana sayfa: http://localhost:5000
      - Video yükleme: POST http://localhost:5000/upload
      - Video listesi: GET http://localhost:5000/videos
    
    💡 Not: Frontend'i index.html dosyasını tarayıcıda açarak kullanın
    
    """)
    
    app.run(debug=True, port=5000)
