from functools import wraps
from flask import session, redirect, url_for, request, abort


def current_user():
    username = session.get('username')
    role = session.get('role')
    if username:
        return {"username": username, "role": role}
    return None


def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if 'username' not in session:
            return redirect(url_for('auth.login', next=request.path))
        return f(*args, **kwargs)
    return wrapper


def role_required(role):
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            if session.get('role') != role:
                # If not logged in, send to login; otherwise 403
                if 'username' not in session:
                    return redirect(url_for('auth.login', next=request.path))
                abort(403)
            return f(*args, **kwargs)
        return wrapper
    return decorator


admin_required = role_required('Admin')
