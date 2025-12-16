from flask import Blueprint, render_template
from flask import redirect, url_for, request

user_bp = Blueprint('user', __name__)

@user_bp.route("/user/<username>")
def user_profile(username):
    user = USERS.get(username.upper())
    if not user:
        return redirect(url_for('user.user_not_found', requested_username=username)) 
    return render_template("profile.html", user=user)

@user_bp.route("/user-not-found")
def user_not_found():
    requested_username = request.args.get('requested_username', 'Bilinmeyen Kullanıcı')
    return render_template("user_not_found.html", requested_username=requested_username), 404