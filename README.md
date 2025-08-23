# Real-Time Chess Game (لعبة شطرنج مباشرة)

This is a web-based, real-time multiplayer chess game built with React and Firebase.

*   **Created by:** ABW (as requested)
*   **Enhanced by:** Jules (AI Software Engineer)

## Features (الميزات)

*   Real-time multiplayer gameplay using Firestore.
*   Anonymous user authentication via Firebase Auth.
*   Complete chess logic including all standard and special moves (Castling, En Passant, Pawn Promotion).
*   Check, Checkmate, and Stalemate detection.
*   Move timer.

## Project Setup (إعداد المشروع)

### 1. Install Dependencies (تثبيت الاعتماديات)

First, install the necessary Node.js packages.
```bash
npm install
```

### 2. Firebase Configuration (تهيئة Firebase)

This project requires a Firebase project to handle the backend (database and authentication).

**You must create your own Firebase project to run this application.**

1.  Go to the [Firebase Console](https://console.firebase.google.com/).
2.  Create a new project.
3.  In your project, create a new **Web App**.
4.  You will be given a `firebaseConfig` object. Copy it.
5.  Open the file `src/firebase-config.js` in this project.
6.  Replace the placeholder content with your actual Firebase config object.

**Example `src/firebase-config.js`:**
```javascript
// THIS IS A PLACEHOLDER CONFIGURATION
// For the app to work, you must replace this with your own
// Firebase project configuration.
export const firebaseConfig = {
  apiKey: "AIzaSy...YOUR_API_KEY",
  authDomain: "your-project-id.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project-id.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef1234567890"
};

// You can leave these as they are for now.
export const appId = 'default-app-id';
export const initialAuthToken = null;
```

### 3. Firestore Database Rules (قواعد بيانات Firestore)

For the game to work, you need to set the correct security rules for your Firestore database to allow users to read and write game data.

1.  In the Firebase Console, go to **Firestore Database**.
2.  Go to the **Rules** tab.
3.  Replace the existing rules with the following to allow public access for this game. **Note: These rules are not secure for a production application with sensitive data, but are suitable for this public game.**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow public read/write access to the chess games data
    match /artifacts/{appId}/public/data/chess_games/{gameId} {
      allow read, write: if true;
    }
  }
}
```

## Running the Game (تشغيل اللعبة)

### Running Locally (التشغيل المحلي)

To run the game on your local machine for development, use the following command. This will start a development server, usually at `http://localhost:5173`.

```bash
npm run dev
```

### Deployment to GitHub Pages (النشر على GitHub Pages)

This project is configured for easy deployment to GitHub Pages.

Simply run the following command in your terminal:

```bash
npm run deploy
```

This command will automatically:
1.  Build the application for production.
2.  Push the built files to a special `gh-pages` branch on your repository.
3.  GitHub Pages will then serve the application from this branch.

After running the command, your updated game should be live at [https://abnjv.github.io/A](https://abnjv.github.io/A) within a few minutes.
