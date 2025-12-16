from flask import Flask, request, render_template, jsonify
import os

app = Flask(__name__)

@app.route("/")
def home():
    return "Hello from Flask!"

@app.route("/about")
def about():
    return "This is about page!"

@app.route("/user/<username>")
def user(username):
    return f"Hello {username}!"

@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form["username"]
        print("The user :", username)
        return f"Hello dear {username}"
    return render_template("login.html")

@app.route("/fetch")
def fetch_page():
    return render_template("fetch.html")

@app.route("/fetch-login", methods=["POST"])
def fetch_login():
    username = request.form["username"]
    print("The name comes with fetch:", username)
    return f"Fetch hello {username}"

@app.route("/json")
def json_page():
    return render_template("json.html")

@app.route("/api/login", methods=["POST"])
def api_login():
    data = request.json
    username = data["username"]
    print("JSON ile gelen:", username)

    return jsonify({
        "status": "ok",
        "message": f"Welcome {username}"
    })

@app.route("/upload-page")
def upload_page():
    return render_template("upload.html")

@app.route("/upload", methods=["POST"])
def upload():
    file = request.files["file"]
    if file.filename == "":
        return "No file selected", 400
    os.makedirs("uploads", exist_ok=True)
    filepath = os.path.join("uploads", file.filename)
    file.save(filepath)
    print("Saved file: ", filepath)
    return "File uploaded successfully"

if __name__ == "__main__":
    app.run(debug=True)
