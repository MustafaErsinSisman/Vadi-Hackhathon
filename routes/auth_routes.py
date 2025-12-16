from flask import Blueprint, render_template, request, redirect, url_for, session, flash

USERS = {
    "YUNUS": {"username": "YUNUS", "role": "Admin", "status": "Active"},
    "ALICE": {"username": "ALICE", "role": "User", "status": "Offline"},
    "BOB": {"username": "BOB", "role": "Moderator", "status": "Active"},
}

auth_bp = Blueprint('auth', __name__)

@auth_bp.route("/login", methods=["GET", "POST"])
def login():
    next_url = request.args.get('next')
    if request.method == "POST":
        username = request.form["username"].upper()
        print(username)
        if username not in USERS:
            flash('Invalid user')
            return render_template("login.html"), 401
        # Set session
        session['username'] = USERS[username]['username']
        session['role'] = USERS[username]['role']
        flash(f"Hoşgeldin {username}")
        if next_url:
            return redirect(next_url)
        return redirect(url_for("user.user_profile", username=username))
    return render_template("login.html")

@auth_bp.route('/logout')
def logout():
    session.pop('username', None)
    session.pop('role', None)
    flash('Çıkış yapıldı')
    return redirect(url_for('main.index'))

@auth_bp.route("/fetch-login", methods=["POST"])
def fetch_login():
    username = request.form["username"]
    print("The name comes with fetch:", username)
    return f"Fetch hello {username}"