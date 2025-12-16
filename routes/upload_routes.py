from flask import Blueprint, request, render_template, session, flash
import os
from werkzeug.utils import secure_filename
from routes.auth_utils import login_required, admin_required

upload_bp = Blueprint('upload', __name__)

@upload_bp.route("/upload-page")
@login_required
@admin_required
def upload_page():
    return render_template("upload.html")

@upload_bp.route("/upload", methods=["POST"])
@login_required
@admin_required
def upload():
    # Uploads are stored per user to keep files separated
    username = session.get('username')
    if not username:
        return "Unauthorized", 401

    file = request.files.get("file")
    if not file or file.filename == "":
        return "No file selected", 400

    filename = secure_filename(file.filename)
    user_dir = os.path.join("uploads", username)
    os.makedirs(user_dir, exist_ok=True)
    filepath = os.path.join(user_dir, filename)
    file.save(filepath)
    print("Saved file: ", filepath)
    flash('Dosya başarıyla yüklendi')
    return "File uploaded successfully"