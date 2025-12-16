from flask import Blueprint, request, render_template
import os

upload_bp = Blueprint('upload', __name__)

@upload_bp.route("/upload-page")
def upload_page():
    return render_template("upload.html")

@upload_bp.route("/upload", methods=["POST"])
def upload():
    file = request.files["file"]
    if file.filename == "":
        return "No file selected", 400
    os.makedirs("uploads", exist_ok=True)
    filepath = os.path.join("uploads", file.filename)
    file.save(filepath)
    print("Saved file: ", filepath)
    return "File uploaded successfully"