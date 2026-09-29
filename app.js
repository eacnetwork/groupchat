import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { getDatabase, ref, get, set, push, query, orderByChild, limitToLast, onValue, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const $ = (selector) => document.querySelector(selector);
const messagesEl = $("#messages");
const form = $("#message-form");
const messageInput = $("#message-input");
const sendButton = form.querySelector("button");
const nameDialog = $("#name-dialog");
const nameForm = $("#name-form");
const nameInput = $("#name-input");
const statusEl = $("#connection-status");
const setupNotice = $("#setup-notice");

let app;
let auth;
let database;
let currentUser;
let currentProfile;

function showSetupError(message) {
  setupNotice.textContent = message;
  setupNotice.classList.remove("hidden");
  statusEl.textContent = "Setup required";
  statusEl.classList.add("offline");
  messagesEl.innerHTML = "<p class='empty-state'>The chat is not configured yet.</p>";
}

function configured() {
  return firebaseConfig && Object.values(firebaseConfig).every(Boolean) && !firebaseConfig.apiKey.includes("PASTE_");
}

function renderMessage(message) {
  const item = document.createElement("article");
  item.className = `message ${message.uid === currentUser.uid ? "mine" : ""}`;
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  const name = document.createElement("strong");
  name.textContent = message.name || "Anonymous";
  const text = document.createElement("p");
  text.textContent = message.text;
  const time = document.createElement("time");
  if (message.createdAt) time.textContent = new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  bubble.append(name, text, time);
  item.appendChild(bubble);
  messagesEl.appendChild(item);
}

function listenForMessages() {
  const messagesQuery = query(ref(database, "messages"), orderByChild("createdAt"), limitToLast(100));
  onValue(messagesQuery, (snapshot) => {
    messagesEl.replaceChildren();
    if (!snapshot.exists()) {
      messagesEl.innerHTML = "<p class='empty-state'>No messages yet. Say hello!</p>";
      return;
    }
    const messages = [];
    snapshot.forEach((child) => messages.push({ id: child.key, ...child.val() }));
    messages.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)).forEach(renderMessage);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }, () => showSetupError("Could not read messages. Check your Realtime Database rules."));
}

async function loadOrCreateProfile(user) {
  const profileRef = ref(database, `users/${user.uid}`);
  const snapshot = await get(profileRef);
  if (snapshot.exists() && snapshot.val().name) return snapshot.val();
  nameDialog.showModal();
  return new Promise((resolve) => {
    nameForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const name = nameInput.value.trim();
      if (!name) return;
      const profile = { name, createdAt: serverTimestamp() };
      await set(profileRef, profile);
      nameDialog.close();
      resolve({ name });
    }, { once: true });
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = messageInput.value.trim();
  if (!text || !currentUser || !currentProfile) return;
  sendButton.disabled = true;
  try {
    await push(ref(database, "messages"), { uid: currentUser.uid, name: currentProfile.name, text, createdAt: serverTimestamp() });
    messageInput.value = "";
  } catch {
    showSetupError("Your message could not be sent. Check the database rules.");
  } finally {
    sendButton.disabled = false;
    messageInput.focus();
  }
});

async function start() {
  if (!configured()) {
    showSetupError("Add your Firebase web settings to firebase-config.js, then redeploy this site.");
    return;
  }
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    database = getDatabase(app);
    onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      currentUser = user;
      currentProfile = await loadOrCreateProfile(user);
      statusEl.textContent = `Online · ${currentProfile.name}`;
      statusEl.classList.remove("offline");
      messageInput.disabled = false;
      sendButton.disabled = false;
      listenForMessages();
      messageInput.focus();
    });
    await signInAnonymously(auth);
  } catch (error) {
    console.error(error);
    showSetupError("Firebase could not start. Check firebase-config.js and enable Anonymous Authentication.");
  }
}
start();
