Manual verification steps for auth and role restrictions

1) Start the app
   - python app.py

2) Admin upload flow
   - Open http://127.0.0.1:5000/
   - Click "Giriş" and log in with username: YUNUS
   - You should see the upload button and be able to open /upload-page
   - Upload a file and verify it's saved in the `uploads/<USERNAME>/` directory (e.g., `uploads/YUNUS/yourfile.mp4`)

4) Non-admin upload prevention
   - Log out
   - Login with username: ALICE
   - The homepage should say you need to be Admin to upload
   - Attempt to open /upload-page manually — you should see a 403 page

6) "Başla" button behavior
   - On the homepage click the "Başla" button
   - If you're not logged in, you should be redirected to the login page
   - If you're logged in, "Başla" stays on the homepage (or can be customized to go elsewhere)

4) Profile access
   - While logged in as ALICE, visit /user/ALICE — you can view
   - While logged in as ALICE, visit /user/YUNUS — you should get 403
   - While logged in as YUNUS (Admin), visit /user/ALICE — Admin can view others profiles

5) Logout
   - Visit /logout and ensure session cleared and upload link hidden

Notes:
- Test users are defined in `routes/auth_routes.py` (YUNUS=Admin, ALICE=User, BOB=Moderator)
- For production, replace `app.secret_key` with a secure environment-provided key
