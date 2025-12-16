from flask import Blueprint, render_template, session, redirect, url_for

main_bp = Blueprint('main', __name__)

@main_bp.route("/")
def home():
    if not session.get('username'):
        # Kullanıcı login değilse login sayfasına yönlendir
        return redirect(url_for('auth.login', next=url_for('main.home')))
    return render_template("index.html")

@main_bp.route("/about")
def about():
    return "This is about page!"

@main_bp.route("/fetch")
def fetch_page():
    return render_template("fetch.html")

@main_bp.route("/json")
def json_page():
    return render_template("json.html")
