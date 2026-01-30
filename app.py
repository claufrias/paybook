from flask_cors import CORS

# Initialize CORS with support for credentials
CORS(app, supports_credentials=True)

# Normalize load_user and api_login to use consistent columns

# Example of user_loader update
@user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# Updated API login function
@app.route('/api/auth/login', methods=['POST'])
def api_login():
    # Logic for user login and prevention of redirect loop
    pass
