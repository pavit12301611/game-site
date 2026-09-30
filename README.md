# PSD-gaming

A lightweight, responsive browser arcade for laptops and phones. The shelf contains **40 original retro-style mini-games** with ten compact rulesets, local practice against a browser rival, private 2–3 player rooms, username friends, direct game invites, optional email accounts, guest play, and a UID-gated admin area.

The games are original mini-games and variations, not bundled copyrighted ROMs or downloaded emulators. That keeps the app small, quick to load, and safe to deploy.

## Run it locally

Requirements: Node.js 20+ and npm.

```bash
npm install
npm test
npm run dev
```

Open the Vite URL printed in the terminal. Without Firebase, the home page, all 40 game cards, and local practice mode work. Online rooms, accounts, usernames, friends, and admin data become active once Firebase is configured.

For local online testing, make a root-level `.env.local` containing one line (replace the example values with the Firebase Web app config):

```dotenv
VITE_FIREBASE_CONFIG={"apiKey":"...","authDomain":"your-project.firebaseapp.com","projectId":"your-project","storageBucket":"your-project.firebasestorage.app","messagingSenderId":"123456789","appId":"1:123456789:web:abcdef"}
```

`.env.local` is ignored by Git. Restart `npm run dev` after editing it.

## Exact Firebase + Vercel setup

### 1. Create a Firebase project and Web app

1. Go to [Firebase Console](https://console.firebase.google.com/) and create a project.
2. In **Project settings → General → Your apps**, add a **Web app**. Hosting through Vercel does not require Firebase Hosting.
3. Copy the complete `firebaseConfig` object Firebase gives you. The app reads it as JSON from one Vercel environment field. Typical values look like this:

   ```json
   {"apiKey":"AIza...","authDomain":"your-project.firebaseapp.com","projectId":"your-project","storageBucket":"your-project.firebasestorage.app","messagingSenderId":"123456789012","appId":"1:123456789012:web:abcdef123456"}
   ```

   Include any extra Firebase Web config fields Firebase provides if you want; `measurementId` is optional because this app does not use Analytics. `apiKey` is a public Firebase Web config value, not a server secret. Database access is protected by Firebase Authentication and the Firestore rules below.

### 2. Enable the two sign-in choices

1. In Firebase Console open **Build → Authentication → Get started → Sign-in method**.
2. Enable **Anonymous**. This lets a person join a shared online room as a guest without creating an account. Firebase creates an anonymous identity in the background so Firestore can enforce room membership.
3. Enable **Email/Password**. This is optional for play; it is needed to keep a username and use the friend list.

Local practice needs no Firebase account at all. Online guests do not need to type an email, username, or password. Friend search is for players who chose to create an account and a username.

### 3. Create Firestore and publish the rules

1. Open **Build → Firestore Database → Create database**. Choose a region near your players. Create it in production/locked mode.
2. Open the **Rules** tab.
3. Replace the starter rules with the complete contents of this repository’s [`firestore.rules`](./firestore.rules) file, then click **Publish**.

The rules keep room documents unlistable, limit rooms to their invite link, require Firebase Auth for writes, constrain joining to waiting rooms with open seats, protect friend requests, and make admin flags console-managed only. They intentionally do **not** make game outcomes cheat-proof: these are casual peer rooms, not ranked or prize games. For a competitive leaderboard, move authoritative game actions into Cloud Functions / a trusted server.

There are no composite indexes to create for the current queries. `firebase.json` and `firestore.indexes.json` are included if you later choose to manage Firebase from the CLI.

### 4. Add the one Vercel environment field

1. Import this GitHub repository into Vercel (or open its **Settings → Environment Variables** page).
2. Add exactly one variable:

   - **Name:** `VITE_FIREBASE_CONFIG`
   - **Value:** the complete one-line JSON `firebaseConfig` object from step 1, for example `{"apiKey":"...","authDomain":"...","projectId":"...","storageBucket":"...","messagingSenderId":"...","appId":"..."}`
   - Select the environments you use: **Production**, **Preview**, and **Development** as appropriate.

3. Use Vercel’s normal Vite build settings (also recorded in [`vercel.json`](./vercel.json)): build command `npm run build`, output directory `dist`.
4. Deploy or redeploy after saving the variable. Vite embeds `VITE_*` values at build time, so changing the environment field requires a new deployment.
5. Back in Firebase, open **Authentication → Settings → Authorized domains** and add the production `your-project-name.vercel.app` host and any custom domain you use. Add preview hosts too if you want to test sign-in on Vercel preview deployments.

> Firebase Web config is designed to be present in browser code. Do not put service-account JSON, Admin SDK credentials, private keys, or Firestore rules in this field. The rules are published in Firebase Console, not stored as an environment variable.

### 5. Give your own account admin access

1. Open the deployed PSD-gaming site and choose **Sign in → Create account**. Register the email and username you want to use as the owner.
2. In Firebase Console, go to **Authentication → Users**, find that account, and copy its **UID**.
3. Go to **Firestore Database → Data → Start collection**. Use collection ID `admins`.
4. Set the document ID to your copied UID. Add one field:

   - Field: `admin`
   - Type: `boolean`
   - Value: `true`

5. Refresh the site (or sign out and in). **Admin studio** will appear in the sidebar. The rules permit reading only your own admin document and deny all client writes to the `admins` collection; add or revoke an admin manually in the Firebase Console.

### 6. Invite friends and test the full flow

- Open a game card, choose **Create online room**, select 2 or 3 seats, and send the generated invite link. A guest can join the link without creating an account. The host presses **Start match** when everyone is ready.
- For username friends, both players create an account. Open **Friends → Add by username**, send a request, and have the other player accept it. Use **Challenge** to create a room and deliver an in-app direct invite.
- Use a second browser profile or an incognito window to test another player. To test a three-player room, select **3 players** and join from two separate browser profiles.
- The app supports browser-native share when available and always provides a copyable room link.

## What is included

- **40 games:** Pixel Tic-Tac-Toe, Neon Gomoku, Connect Four, Five in a Row, Memory Match, Neon Pairs, Emoji Flip, Arcade Pairs, Pixel Tap Sprint, Button Masher, Turbo Charge, Reaction Rush, Spacebar Showdown, Bug Blaster, Rock Paper Scissors, Laser Duel, Coin Flip Clash, Dice Duel, Retro Trivia, Emoji Decode, Arcade Facts, Pixel Pop Quiz, Movie Mayhem, Word Scramble, Number Chase, Brain Busters, 8-Bit Riddles, Retro Rewind, Maze Runner, Neon Labyrinth, Byte Escape, Star Runner, Sea Battle, Pixel Fleet, Alien Skirmish, Pong Rally, Paddle Wars, Air Hockey, Codebreaker, and Mastermind.
- **Ten lightweight shared engines:** line boards, drop boards, memory pairs, tap races, simultaneous duels, quiz rounds, maze races, hidden-grid battles, volley scoring, and codebreaking. Each catalog entry can be opened, practiced locally, or used to create an online room.
- **Firebase:** Auth (Anonymous + Email/Password) and Cloud Firestore. Multiplayer moves use Firestore transactions so concurrent turns do not silently overwrite one another.
- **Admin:** `admins/{authUid}` with `admin: true`. The client hides the admin page unless the signed-in UID is approved; Firestore rules separately enforce admin-only room listing and deny client-side admin edits.
- **Accessibility / small screens:** semantic controls, keyboard arrows in maze games, Space for tap races, reduced-motion support, and responsive layouts down to 320px wide.

## Notes

- The browser must allow JavaScript. Online features require a network connection and a configured Firebase project.
- A room invite is a private-by-ID link, not a password-protected secret. Anyone holding it may join while it is waiting and has capacity. Do not put sensitive data in rooms.
- Anonymous Firebase accounts can be cleaned up periodically from Firebase Console if you want to limit unused guest accounts.
