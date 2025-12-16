from flask import Blueprint, render_template, request, redirect, url_for

USERS = {
    "YUNUS": {"username": "YUNUS", "role": "Admin", "status": "Active"},
    "ALICE": {"username": "ALICE", "role": "User", "status": "Offline"},
    "BOB": {"username": "BOB", "role": "Moderator", "status": "Active"},
}

auth_bp = Blueprint('auth', __name__)

@auth_bp.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form["username"].upper()
        print(username)
        if username not in USERS:
            return "Invalid user", 401
        return redirect(url_for("user.user_profile", username=username))
    return render_template("login.html")

@auth_bp.route("/fetch-login", methods=["POST"])
def fetch_login():
    username = request.form["username"]
    print("The name comes with fetch:", username)
    return f"Fetch hello {username}"