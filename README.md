# ChatWave — real-person chat + voice/video calling

This is a starter Progressive Web App (PWA). It runs as a website and can be installed on supported Android browsers. It is not a signed native APK. It uses Firebase Phone Authentication, Cloud Firestore and browser WebRTC.

## Included
- Phone-number sign-in using Firebase SMS OTP + reCAPTCHA
- Registered-user directory (phone numbers)
- Realtime one-to-one text messaging
- Voice and video call signaling with Firestore
- WebRTC audio/video streams, mute, camera toggle, hang up
- Responsive mobile UI and installable PWA shell

## 1. Configure Firebase
1. Create a project at https://console.firebase.google.com/
2. Add a Web app and copy its config into `firebase-config.js`.
3. Authentication → Sign-in method → enable **Phone**.
4. Authentication → Settings → Authorized domains: add your deployed domain.
5. Firestore Database → create a database.
6. Publish the contents of `firestore.rules` in Firestore → Rules.
7. For local development, add `localhost` as an authorized domain. Use Firebase's fictional test phone numbers/codes while testing to avoid sending real SMS.

## 2. Run locally
Because ES modules, camera/microphone and service workers require a secure origin, do not open `index.html` as a `file://` URL.

From this folder run:
```bash
python -m http.server 8080
```
Then open `http://localhost:8080` in a modern browser. Phone auth may require your Firebase authorized domain and reCAPTCHA setup.

## 3. Deploy
Deploy the folder to Firebase Hosting (or another HTTPS static host). For Firebase Hosting:
```bash
npm install -g firebase-tools
firebase login
firebase init hosting
# Choose this folder as the public directory; configure as a single-page app: No
firebase deploy
```
Use HTTPS in production. Android users can open the deployed URL in Chrome and choose **Install app** / **Add to Home screen**.

## 4. Important production requirements
- The included WebRTC configuration uses a public STUN server only. Calls may fail on restrictive mobile/carrier/Wi-Fi networks. Add a reputable TURN service and use short-lived TURN credentials for reliable production calling.
- This starter does not implement push notifications, group chats, media/file sharing, end-to-end encryption, spam controls, contact discovery, blocking/reporting, or call history.
- Firestore rules are a baseline, not a complete security audit. Review and test them before production. In particular, add App Check, abuse/rate limiting, privacy controls and server-side validation.
- User directory currently exposes signed-in users' phone numbers to other signed-in users. If that is not acceptable, replace it with an opt-in username/contact system and stricter rules.
- Never put service-account keys or private TURN credentials in frontend code.
- For a native Android application with Play Store distribution, build a separate Android client (e.g. Kotlin) using the same Firebase backend. This PWA can be installed on Android but is not a native APK.

## Troubleshooting
- Phone OTP: check Phone provider enabled, authorized domain, billing/SMS quotas and reCAPTCHA.
- Camera/mic: grant browser permissions and use HTTPS (localhost is accepted for development).
- Missing Firestore index: follow the index creation link in the browser console if Firebase requests one.
- One-way/no calls: check Firestore rules, both peers' permissions, and configure TURN.
