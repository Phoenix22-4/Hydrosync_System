import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';

// Hardcoded Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAMZBDjhjMzmwMdfqypNpzBhKLGziAh9gA",
  authDomain: "gen-lang-client-0769388576.firebaseapp.com",
  projectId: "gen-lang-client-0769388576",
  storageBucket: "gen-lang-client-0769388576.firebasestorage.app",
  messagingSenderId: "824887409216",
  appId: "1:824887409216:web:657f3447ee115704277da5",
  databaseId: "ai-studio-29435203-c206-4d7b-8d53-88b01a2f2567"
};

// Initialize Firebase SDK
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.databaseId);
export const auth = getAuth(app);

// Set persistence to local
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.error("Auth persistence error:", err);
});

// Test connection to Firestore
async function testConnection() {
  try {
    // Attempt to get a dummy document to verify connection
    await getDocFromServer(doc(db, '_system_', 'connection_test'));
    console.log("Firebase connection established successfully.");
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. The client is offline.");
    }
    // Other errors (like 404) are fine for a connection test
  }
}

testConnection();

export default app;
