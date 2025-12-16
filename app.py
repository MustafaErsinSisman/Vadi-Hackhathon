from flask import Flask
from routes.main_routes import main_bp
from routes.user_routes import user_bp
from routes.api_routes import api_bp
from routes.upload_routes import upload_bp
from routes.auth_routes import auth_bp

app = Flask(__name__)

app.register_blueprint(main_bp)
app.register_blueprint(user_bp)
app.register_blueprint(api_bp)
app.register_blueprint(upload_bp)
app.register_blueprint(auth_bp)

if __name__ == "__main__":
    app.run(debug=True)