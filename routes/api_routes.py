from flask import Blueprint, request, jsonify

api_bp = Blueprint('api', __name__)

@api_bp.route("/api/login", methods=["POST"])
def api_login():
    data = request.json
    username = data["username"]
    print("JSON ile gelen:", username)

    return jsonify({
        "status": "ok",
        "message": f"Welcome {username}"
    })