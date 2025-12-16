import os
from flask import Flask, render_template

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')

@app.route('/')
def index():
    videos = []
    return render_template('index.html', videos=videos)

categories = [
    {"name": "Müzik", "description": "Müzik videoları", "image": None},
    {"name": "Oyun", "description": "Oyun videoları", "image": None},
    {"name": "Eğitim", "description": "Eğitici içerikler", "image": None}
]

@app.route("/")
def home():
    return render_template("home.html", videos=[])

@app.route("/categories")
def categories_page():
    return render_template("categories.html", categories=categories)

@app.route("/about")
def about_page():
    return render_template("about.html")

if __name__ == "__main__":
    app.run(debug=True)
