import os
from flask import Flask, render_template, request, redirect, url_for, flash, jsonify
from werkzeug.utils import secure_filename
from datetime import datetime
import shutil
import json
import urllib.request
import urllib.error

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')

# Dosya yükleme ayarları
UPLOAD_FOLDER = 'static/uploads'
ALLOWED_EXTENSIONS = {'mp4', 'avi', 'mov', 'wmv', 'flv', 'webm'}
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  # 500 MB max dosya boyutu

# Klasör yoksa oluştur
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

categories = [
    {"name": "Müzik", "description": "Müzik videoları", "image": None},
    {"name": "Oyun", "description": "Oyun videoları", "image": None},
    {"name": "Eğitim", "description": "Eğitici içerikler", "image": None}
]

# Örnek kullanıcı videoları (normalde veritabanından gelecek)
# id: 1, 2, 3... ile art arda giden id'ler olmalı
user_videos = []

@app.route('/')
def index():
    videos = user_videos  # Tüm videoları göster
    return render_template('index.html', videos=videos)

# ... (Diğer rotalarınız: categories_page, about_page, profile_page)

@app.route("/categories")
def categories_page():
    return render_template("categories.html", categories=categories)

@app.route("/about")
def about_page():
    return render_template("about.html")

@app.route("/profile")
def profile_page():
    total_views = sum(video.get('views', 0) for video in user_videos)
    total_likes = sum(video.get('likes', 0) for video in user_videos)
    return render_template("profile.html", 
                         user_videos=user_videos,
                         total_views=total_views,
                         total_likes=total_likes)

# --- YENİ ROTA EKLEMESİ BAŞLANGICI ---

# In-memory chat storage for fallback when Socket.IO is not available
chat_messages = {}
_next_message_id = 1

def _next_id():
    global _next_message_id
    _next_message_id += 1
    return _next_message_id

@app.route('/chat/<room>', methods=['POST'])
def post_chat(room):
    """Store a chat message and forward to Node.js broadcast endpoint if available."""
    data = request.get_json() or {}
    user = data.get('user') or request.remote_addr[:6]
    message = data.get('message')
    if not message:
        return jsonify({'error': 'message required'}), 400

    msg = {
        'id': _next_id(),
        'user': user,
        'message': message,
        'ts': datetime.utcnow().isoformat()
    }
    chat_messages.setdefault(room, []).append(msg)

    # Forward to Node.js if available (include message id to avoid duplicates)
    forward_flag = data.get('forward', True)
    if forward_flag:
        try:
            node_url = os.environ.get('NODE_CONVERT_URL', 'http://localhost:3000')
            req = urllib.request.Request(f"{node_url}/broadcast", data=json.dumps({'room': room, 'user': user, 'message': message, 'id': msg['id']}).encode('utf-8'), headers={'Content-Type': 'application/json'}, method='POST')
            urllib.request.urlopen(req, timeout=1)
        except Exception:
            # Ignore forwarding errors; message is stored locally
            pass

    return jsonify(msg)

@app.route('/chat/<room>', methods=['GET'])
def get_chat(room):
    """Return messages for a room after an optional 'since' id."""
    since = int(request.args.get('since', 0))
    msgs = [m for m in chat_messages.get(room, []) if m['id'] > since]
    return jsonify({'messages': msgs})

@app.route("/video/<int:video_id>")
def video_detail(video_id):
    # video_id'ye göre videoyu user_videos listesinde bul
    video = next((v for v in user_videos if v['id'] == video_id), None)
    
    if video is None:
        flash('Video bulunamadı!')
        return redirect(url_for('index'))
    
    # Görüntülenme sayısını artır (Basit bir örnek)
    video['views'] = video.get('views', 0) + 1
    
    return render_template('video_detail.html', video=video)
# --- YENİ ROTA EKLEMESİ SONU ---

# (Not using a separate live page anymore) Features from the previous
# "live" page (chat, stats panel) are integrated into the regular
# `video_detail` page so uploaded videos get the same interactivity.



@app.route("/upload", methods=['POST'])
def upload_video():
    if 'video' not in request.files:
        flash('Video dosyası seçilmedi!')
        return redirect(url_for('profile_page'))
    
    file = request.files['video']
    
    if file.filename == '':
        flash('Video dosyası seçilmedi!')
        return redirect(url_for('profile_page'))
    
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        # Benzersiz dosya adı oluştur
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"{timestamp}_{filename}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        # Video bilgilerini kaydet
        video_data = {
            'id': len(user_videos) + 1,
            'title': request.form.get('title'),
            'description': request.form.get('description'),
            'category': request.form.get('category'),
            # Eğer thumbnail gönderilmezse varsayılan bir görsel kullan
            'thumbnail': request.form.get('thumbnail') or 'https://via.placeholder.com/320x180?text=Video+Thumbnail', 
            'filepath': filepath,
            'filename': filename,
            'duration': '00:00',
            'views': 0,
            'likes': 0,
            'created_at': datetime.now().strftime('%d.%m.%Y')
        }
        user_videos.append(video_data)
        
        # Notify Node.js converter to process this file for HLS
        try:
            node_url = os.environ.get('NODE_CONVERT_URL', 'http://localhost:3000/convert')
            payload = json.dumps({
                'filename': filename,
                'sourceUrl': request.host_url.rstrip('/') + url_for('static', filename=f'uploads/{filename}'),
                'room': f"video_{video_data['id']}"
            }).encode('utf-8')
            req = urllib.request.Request(node_url, data=payload, headers={'Content-Type': 'application/json'}, method='POST')
            urllib.request.urlopen(req, timeout=5)
        except Exception as e:
            print('Could not notify Node converter:', e)

        flash('Video başarıyla yüklendi!')
        return redirect(url_for('profile_page'))
    else:
        flash('Geçersiz dosya formatı! Sadece video dosyaları yüklenebilir.')
        return redirect(url_for('profile_page'))

@app.route("/delete/<int:video_id>", methods=['POST'])
def delete_video(video_id):
    global user_videos
    video = next((v for v in user_videos if v['id'] == video_id), None)
    
    if video:
        # Dosyayı sil
        try:
            if os.path.exists(video['filepath']):
                os.remove(video['filepath'])
        except Exception as e:
            print(f"Dosya silinirken hata: {e}")
        
        # Listeden çıkar
        user_videos = [v for v in user_videos if v['id'] != video_id]
        return jsonify({'success': True})
    
    return jsonify({'success': False})

if __name__ == "__main__":
    app.run(debug=True)