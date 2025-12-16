from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename
import os
import json
import time
import hashlib
import threading
import subprocess
from datetime import datetime
import uuid

app = Flask(__name__)
CORS(app)

# Yapılandırma
UPLOAD_FOLDER = 'uploads'
CHUNKS_FOLDER = os.path.join(UPLOAD_FOLDER, 'chunks')
VIDEOS_FOLDER = os.path.join(UPLOAD_FOLDER, 'videos')
THUMBNAILS_FOLDER = os.path.join(UPLOAD_FOLDER, 'thumbnails')
ALLOWED_EXTENSIONS = {'mp4', 'avi', 'mov', 'mkv', 'webm', 'flv', 'wmv'}
MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024  # 2GB
CHUNK_SIZE = 5 * 1024 * 1024  # 5MB

# Klasörleri oluştur
for folder in [UPLOAD_FOLDER, CHUNKS_FOLDER, VIDEOS_FOLDER, THUMBNAILS_FOLDER, 'data']:
    os.makedirs(folder, exist_ok=True)

# Video veritabanı
VIDEOS_DB = 'data/videos.json'
UPLOAD_SESSIONS_DB = 'data/upload_sessions.json'

def load_json(filepath):
    if os.path.exists(filepath):
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}

def save_json(filepath, data):
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def get_video_info(video_path):
    """FFprobe ile video bilgilerini al"""
    try:
        cmd = [
            'ffprobe',
            '-v', 'quiet',
            '-print_format', 'json',
            '-show_format',
            '-show_streams',
            video_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        info = json.loads(result.stdout)
        
        video_info = {
            'duration': float(info['format']['duration']),
            'size': int(info['format']['size']),
            'bitrate': int(info['format']['bit_rate']),
            'format': info['format']['format_name']
        }
        
        # Video stream bilgileri
        for stream in info['streams']:
            if stream['codec_type'] == 'video':
                video_info.update({
                    'width': stream.get('width', 0),
                    'height': stream.get('height', 0),
                    'codec': stream.get('codec_name', 'unknown'),
                    'fps': eval(stream.get('avg_frame_rate', '0/1')) if '/' in stream.get('avg_frame_rate', '0/1') else 0
                })
                break
        
        return video_info
    except Exception as e:
        print(f"Video bilgisi alınamadı: {e}")
        return None

def create_thumbnail(video_path, thumbnail_path, time_offset='00:00:05'):
    """FFmpeg ile thumbnail oluştur"""
    try:
        cmd = [
            'ffmpeg',
            '-i', video_path,
            '-ss', time_offset,  # 5. saniyede
            '-vframes', '1',
            '-vf', 'scale=320:-1',
            '-y',  # Overwrite output file
            thumbnail_path
        ]
        
        subprocess.run(cmd, capture_output=True, check=True)
        return True
    except Exception as e:
        print(f"Thumbnail oluşturulamadı: {e}")
        return False

def compress_video(input_path, output_path, quality='medium'):
    """FFmpeg ile video sıkıştırma"""
    quality_presets = {
        'low': {'crf': 28, 'preset': 'fast'},
        'medium': {'crf': 23, 'preset': 'medium'},
        'high': {'crf': 18, 'preset': 'slow'}
    }
    
    preset = quality_presets.get(quality, quality_presets['medium'])
    
    try:
        cmd = [
            'ffmpeg',
            '-i', input_path,
            '-c:v', 'libx264',
            '-crf', str(preset['crf']),
            '-preset', preset['preset'],
            '-c:a', 'aac',
            '-b:a', '128k',
            '-y',
            output_path
        ]
        
        subprocess.run(cmd, capture_output=True, check=True)
        return True
    except Exception as e:
        print(f"Video sıkıştırma hatası: {e}")
        return False

def process_video_async(file_id, original_path, video_data):
    """Arka planda video işleme"""
    try:
        # Video bilgilerini al
        video_info = get_video_info(original_path)
        
        # Video sıkıştır
        compressed_filename = f"compressed_{video_data['id']}.mp4"
        compressed_path = os.path.join(VIDEOS_FOLDER, compressed_filename)
        
        if compress_video(original_path, compressed_path):
            video_data['compressed_path'] = compressed_path
            video_data['compressed_size'] = os.path.getsize(compressed_path)
        
        # Thumbnail oluştur
        thumbnail_filename = f"thumb_{video_data['id']}.jpg"
        thumbnail_path = os.path.join(THUMBNAILS_FOLDER, thumbnail_filename)
        
        if create_thumbnail(original_path, thumbnail_path):
            video_data['thumbnail'] = thumbnail_filename
        
        # Video bilgilerini güncelle
        if video_info:
            video_data.update(video_info)
        
        video_data['status'] = 'processed'
        video_data['processed_at'] = datetime.now().isoformat()
        
        # Veritabanını güncelle
        videos = load_json(VIDEOS_DB)
        for i, v in enumerate(videos):
            if v['id'] == video_data['id']:
                videos[i] = video_data
                break
        
        save_json(VIDEOS_DB, videos)
        
        # Geçici chunk dosyalarını temizle
        chunk_folder = os.path.join(CHUNKS_FOLDER, file_id)
        if os.path.exists(chunk_folder):
            import shutil
            shutil.rmtree(chunk_folder)
        
        print(f"Video {video_data['id']} işlendi")
        
    except Exception as e:
        print(f"Video işleme hatası: {e}")
        
        # Hata durumunu kaydet
        videos = load_json(VIDEOS_DB)
        for i, v in enumerate(videos):
            if v['id'] == video_data['id']:
                videos[i]['status'] = 'error'
                videos[i]['error'] = str(e)
                break
        
        save_json(VIDEOS_DB, videos)

@app.route('/api/init-upload', methods=['POST'])
def init_upload():
    try:
        data = request.json
        file_id = data.get('fileId')
        filename = data.get('filename')
        total_size = data.get('totalSize')
        total_chunks = data.get('totalChunks')
        
        if not file_id or not filename:
            return jsonify({'success': False, 'error': 'Geçersiz veri'}), 400
        
        if not allowed_file(filename):
            return jsonify({'success': False, 'error': 'İzin verilmeyen dosya türü'}), 400
        
        if total_size > MAX_FILE_SIZE:
            return jsonify({'success': False, 'error': 'Dosya boyutu çok büyük'}), 400
        
        # Upload session'ı başlat
        sessions = load_json(UPLOAD_SESSIONS_DB)
        sessions[file_id] = {
            'filename': secure_filename(filename),
            'total_size': total_size,
            'total_chunks': total_chunks,
            'uploaded_chunks': [],
            'created_at': datetime.now().isoformat(),
            'status': 'uploading'
        }
        
        save_json(UPLOAD_SESSIONS_DB, sessions)
        
        # Chunk klasörünü oluştur
        chunk_folder = os.path.join(CHUNKS_FOLDER, file_id)
        os.makedirs(chunk_folder, exist_ok=True)
        
        return jsonify({
            'success': True,
            'fileId': file_id,
            'chunkSize': CHUNK_SIZE
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/upload-chunk', methods=['POST'])
def upload_chunk():
    try:
        file_id = request.form.get('fileId')
        chunk_index = int(request.form.get('chunkIndex'))
        total_chunks = int(request.form.get('totalChunks'))
        
        if 'chunk' not in request.files:
            return jsonify({'success': False, 'error': 'Chunk bulunamadı'}), 400
        
        chunk_file = request.files['chunk']
        
        # Session kontrolü
        sessions = load_json(UPLOAD_SESSIONS_DB)
        if file_id not in sessions:
            return jsonify({'success': False, 'error': 'Geçersiz session'}), 404
        
        # Chunk'ı kaydet
        chunk_filename = f"chunk_{chunk_index:04d}.part"
        chunk_path = os.path.join(CHUNKS_FOLDER, file_id, chunk_filename)
        chunk_file.save(chunk_path)
        
        # Session'ı güncelle
        sessions[file_id]['uploaded_chunks'].append(chunk_index)
        save_json(UPLOAD_SESSIONS_DB, sessions)
        
        return jsonify({
            'success': True,
            'chunkIndex': chunk_index,
            'uploadedChunks': len(sessions[file_id]['uploaded_chunks']),
            'totalChunks': total_chunks
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/complete-upload', methods=['POST'])
def complete_upload():
    try:
        data = request.json
        file_id = data.get('fileId')
        title = data.get('title', 'İsimsiz Video')
        description = data.get('description', '')
        
        # Session kontrolü
        sessions = load_json(UPLOAD_SESSIONS_DB)
        if file_id not in sessions:
            return jsonify({'success': False, 'error': 'Geçersiz session'}), 404
        
        session = sessions[file_id]
        chunk_folder = os.path.join(CHUNKS_FOLDER, file_id)
        
        # Tüm chunk'lar yüklendi mi kontrol et
        uploaded_chunks = set(session['uploaded_chunks'])
        expected_chunks = set(range(session['total_chunks']))
        
        if uploaded_chunks != expected_chunks:
            return jsonify({
                'success': False, 
                'error': f'Eksik chunklar: {expected_chunks - uploaded_chunks}'
            }), 400
        
        # Chunk'ları birleştir
        original_filename = session['filename']
        original_path = os.path.join(VIDEOS_FOLDER, f"original_{original_filename}")
        
        with open(original_path, 'wb') as output_file:
            for i in range(session['total_chunks']):
                chunk_path = os.path.join(chunk_folder, f"chunk_{i:04d}.part")
                with open(chunk_path, 'rb') as chunk_file:
                    output_file.write(chunk_file.read())
        
        # Video kaydı oluştur
        videos = load_json(VIDEOS_DB)
        video_id = len(videos) + 1
        
        video_data = {
            'id': video_id,
            'fileId': file_id,
            'title': title,
            'description': description,
            'original_filename': original_filename,
            'original_path': original_path,
            'original_size': session['total_size'],
            'uploaded_chunks': session['total_chunks'],
            'uploaded_at': datetime.now().isoformat(),
            'status': 'processing',  # processing, processed, error
            'views': 0,
            'mime_type': f"video/{original_filename.split('.')[-1]}"
        }
        
        videos.append(video_data)
        save_json(VIDEOS_DB, videos)
        
        # Session'ı tamamlandı olarak işaretle
        sessions[file_id]['status'] = 'completed'
        sessions[file_id]['video_id'] = video_id
        save_json(UPLOAD_SESSIONS_DB, sessions)
        
        # Arka planda video işlemeyi başlat
        thread = threading.Thread(
            target=process_video_async,
            args=(file_id, original_path, video_data)
        )
        thread.daemon = True
        thread.start()
        
        return jsonify({
            'success': True,
            'videoId': video_id,
            'message': 'Video yüklendi, işleniyor...'
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/video-status/<int:video_id>', methods=['GET'])
def video_status(video_id):
    try:
        videos = load_json(VIDEOS_DB)
        video = next((v for v in videos if v['id'] == video_id), None)
        
        if not video:
            return jsonify({'error': 'Video bulunamadı'}), 404
        
        response = {
            'status': video.get('status', 'unknown'),
            'videoId': video_id
        }
        
        if video.get('status') == 'processed':
            response.update({
                'thumbnail': f"/thumbnails/{video.get('thumbnail')}" if video.get('thumbnail') else None,
                'duration': video.get('duration'),
                'resolution': f"{video.get('width')}x{video.get('height')}" if video.get('width') else None
            })
        elif video.get('status') == 'error':
            response['error'] = video.get('error')
        
        return jsonify(response)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/resume-upload/<file_id>', methods=['GET'])
def resume_upload(file_id):
    """Kesilen upload'ı devam ettirmek için"""
    try:
        sessions = load_json(UPLOAD_SESSIONS_DB)
        
        if file_id not in sessions:
            return jsonify({'success': False, 'error': 'Session bulunamadı'}), 404
        
        session = sessions[file_id]
        
        # Yüklenmiş chunk'ları kontrol et
        chunk_folder = os.path.join(CHUNKS_FOLDER, file_id)
        uploaded_chunks = []
        
        if os.path.exists(chunk_folder):
            for filename in os.listdir(chunk_folder):
                if filename.startswith('chunk_') and filename.endswith('.part'):
                    chunk_index = int(filename.split('_')[1].split('.')[0])
                    uploaded_chunks.append(chunk_index)
        
        return jsonify({
            'success': True,
            'uploadedChunks': sorted(uploaded_chunks),
            'totalChunks': session['total_chunks'],
            'filename': session['filename']
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/thumbnails/<filename>')
def serve_thumbnail(filename):
    return send_from_directory(THUMBNAILS_FOLDER, filename)

@app.route('/videos/<filename>')
def serve_video(filename):
    return send_from_directory(VIDEOS_FOLDER, filename)

@app.route('/api/videos', methods=['GET'])
def get_videos():
    try:
        videos = load_json(VIDEOS_DB)
        
        # Sadece işlenmiş videoları göster
        processed_videos = [v for v in videos if v.get('status') == 'processed']
        
        # İstemci için gerekli bilgileri filtrele
        for video in processed_videos:
            video['thumbnail_url'] = f"/thumbnails/{video.get('thumbnail')}" if video.get('thumbnail') else None
            video['video_url'] = f"/videos/compressed_{video['id']}.mp4"
            video['duration_formatted'] = format_duration(video.get('duration', 0))
        
        return jsonify(processed_videos)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def format_duration(seconds):
    """Saniyeyi dakika:saat formatına çevir"""
    if not seconds:
        return "0:00"
    
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    
    if hours > 0:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    else:
        return f"{minutes}:{secs:02d}"

if __name__ == '__main__':
    print("""
    🎬 Gelişmiş Video Upload Server Başlatılıyor...
    
    Özellikler:
    ✅ Chunked Upload (5MB parçalar)
    ✅ FFmpeg ile video işleme
    ✅ Otomatik thumbnail oluşturma
    ✅ Video sıkıştırma
    ✅ Resume özelliği
    ✅ Video bilgisi çıkarma
    
    📍 Ana Endpointler:
      - POST /api/init-upload      : Upload'ı başlat
      - POST /api/upload-chunk     : Chunk yükle
      - POST /api/complete-upload  : Upload'ı tamamla
      - GET  /api/video-status/:id : Video durumu
      - GET  /api/resume-upload/:id: Upload'ı devam ettir
    
    🔧 FFmpeg gereksinimleri:
      Ubuntu/Debian: sudo apt install ffmpeg
      MacOS: brew install ffmpeg
      Windows: https://ffmpeg.org/download.html
    
    """)
    
    # FFmpeg kontrolü
    try:
        subprocess.run(['ffmpeg', '-version'], capture_output=True, check=True)
        print("✅ FFmpeg bulundu ve çalışıyor")
    except:
        print("⚠️  FFmpeg bulunamadı! Video işleme özellikleri çalışmayacak.")
        print("   Lütfen FFmpeg'i kurun: https://ffmpeg.org/download.html")
    
    app.run(debug=True, port=5000, threaded=True)