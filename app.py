from flask import Flask, render_template
from routes.main_routes import main_bp
from routes.user_routes import user_bp
from routes.api_routes import api_bp
from routes.upload_routes import upload_bp
from routes.auth_routes import auth_bp

app = Flask(__name__)

# Secret key for session handling (development/demo purpose).
# For production, set this from an environment variable.
app.secret_key = "dev_secret_key"

app.register_blueprint(main_bp)
app.register_blueprint(user_bp)
app.register_blueprint(api_bp)
app.register_blueprint(upload_bp)
app.register_blueprint(auth_bp)


# Friendly 403 handler
@app.errorhandler(403)
def forbidden(e):
    return render_template('403.html'), 403

if __name__ == "__main__":
    app.run(debug=True)