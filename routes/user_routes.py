from flask import Blueprint, render_template, redirect, url_for, request, abort, session
from routes.auth_utils import login_required, current_user

USERS = {
    "YUNUS": {"username": "YUNUS", "role": "Admin", "status": "Active"},
    "ALICE": {"username": "ALICE", "role": "User", "status": "Offline"},
    "BOB": {"username": "BOB", "role": "Moderator", "status": "Active"},
}

user_bp = Blueprint('user', __name__)

@user_bp.route("/user/<username>")
@login_required
def user_profile(username):
    user = USERS.get(username.upper())
    if not user:
        return redirect(url_for('user.user_not_found', requested_username=username))
    cu = current_user()
    # Allow owner or Admin
    if cu['username'] != username.upper() and cu['role'] != 'Admin':
        abort(403)
    return render_template("profile.html", user=user)

@user_bp.route("/user-not-found")
def user_not_found():
    requested_username = request.args.get('requested_username', 'Bilinmeyen Kullanıcı')
    return render_template("user_not_found.html", requested_username=requested_username), 404