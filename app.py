# import os
# from flask import Flask, render_template

# app = Flask(__name__)
# app.secret_key = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')

# @app.route('/')
# def index():
#     videos = []
#     return render_template('index.html', videos=videos)

# categories = [
#     {"name": "Müzik", "description": "Müzik videoları", "image": None},
#     {"name": "Oyun", "description": "Oyun videoları", "image": None},
#     {"name": "Eğitim", "description": "Eğitici içerikler", "image": None}
# ]

# @app.route("/")
# def home():
#     return render_template("home.html", videos=[])

# @app.route("/categories")
# def categories_page():
#     return render_template("categories.html", categories=categories)

# @app.route("/about")
# def about_page():
#     return render_template("about.html")

# if __name__ == "__main__":
#     app.run(debug=True)

import os
from flask import Flask, render_template, request, redirect, url_for, flash, jsonify
from werkzeug.utils import secure_filename
from datetime import datetime

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
user_videos = []

@app.route('/')
def index():
    videos = user_videos  # Tüm videoları göster
    return render_template('index.html', videos=videos)

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
            'thumbnail': request.form.get('thumbnail') or 'https://via.placeholder.com/320x180?text=Video',
            'filepath': filepath,
            'filename': filename,
            'duration': '00:00',
            'views': 0,
            'likes': 0,
            'created_at': datetime.now().strftime('%d.%m.%Y')
        }
        user_videos.append(video_data)
        
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