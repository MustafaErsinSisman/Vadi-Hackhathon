# from flask import Flask, render_template

# app = Flask(__name__)
# app.secret_key = 'supersecretkey'

# @app.route('/')
# def index():
#     # Örnek veri - gerçek veritabanınızla değiştirin
#     videos = [
#         {
#             'id': 1,
#             'title': 'Python Flask Eğitimi',
#             'description': 'Flask ile modern web uygulamaları geliştirme',
#             'thumbnail': 'https://via.placeholder.com/320x180/667eea/ffffff?text=Python+Flask',
#             'duration': '15:30',
#             'views': 1250,
#             'created_at': '2024-01-15'
#         },
#         # Daha fazla video ekleyin...
#     ]
    
#     return render_template('index.html', videos=videos)

# if __name__ == '__main__':
#     app.run(debug=True)

import os
from flask import Flask, render_template

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')

@app.route('/')
def index():
    videos = []
    return render_template('index.html', videos=videos)

if __name__ == '__main__':
    app.run(debug=True)