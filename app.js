import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.43.0/+esm";

const SUPABASE_URL = "https://ublmdrosnkxwitoygxyq.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_z-TDvg8Lw2Ynz8j_VWRIpQ_9e7LhHJq";
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const $ = (selector) => document.querySelector(selector);
const messagesElement = $("#messages");
const messageForm = $("#message-form");
const messageInput = $("#message-input");
const sendButton = messageForm.querySelector("button");
const nameDialog = $("#name-dialog");
const nameForm = $("#name-form");
const nameInput = $("#name-input");
const statusElement = $("#connection-status");
const noticeElement = $("#setup-notice");

let currentUser = null;
let currentProfile = null;
let realtimeChannel = null;

function showError(message) {
  noticeElement.textContent = message;
  noticeElement.classList.remove("hidden");
  statusElement.textContent = "Connection error";
  statusElement.classList.add("offline");
  messageInput.disabled = true;
  sendButton.disabled = true;
}

function clearError() {
  noticeElement.textContent = "";
  noticeElement.classList.add("hidden");
  statusElement.classList.remove("offline");
}

function renderMessage(message) {
  const article = document.createElement("article");
  article.className = `message${currentUser && message.user_id === currentUser.id ? " mine" : ""}`;
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  const author = document.createElement("strong");
  author.textContent = message.user_name || "Anonymous";
  const text = document.createElement("p");
  text.textContent = message.text;
  const time = document.createElement("time");
  if (message.created_at) time.textContent = new Date(message.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  bubble.append(author, text, time);
  article.appendChild(bubble);
  messagesElement.appendChild(article);
}

async function loadMessages() {
  const { data, error } = await supabase.from("messages").select("id, user_id, user_name, text, created_at").order("created_at", { ascending: true }).limit(100);
  if (error) throw error;
  messagesElement.replaceChildren();
  if (!data?.length) {
    messagesElement.innerHTML = "<p class='empty-state'>No messages yet. Say hello!</p>";
    return;
  }
  data.forEach(renderMessage);
  messagesElement.scrollTop = messagesElement.scrollHeight;
}

function subscribeToMessages() {
  realtimeChannel = supabase.channel("public-messages-v2").on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
    messagesElement.querySelector(".empty-state")?.remove();
    renderMessage(payload.new);
    messagesElement.scrollTop = messagesElement.scrollHeight;
  }).subscribe((status) => {
    if (status === "SUBSCRIBED") statusElement.textContent = `Online · ${currentProfile.name}`;
  });
}

async function getOrCreateProfile(user) {
  const { data, error } = await supabase.from("profiles").select("id, name").eq("id", user.id).maybeSingle();
  if (error) throw error;
  if (data) return data;

  nameDialog.showModal();
  nameInput.focus();
  return new Promise((resolve, reject) => {
    nameForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const name = nameInput.value.trim();
      if (!name) return;
      const result = await supabase.from("profiles").insert({ id: user.id, name }).select("id, name").single();
      if (result.error) {
        console.error(result.error);
        alert(`Could not save your name: ${result.error.message}`);
        reject(result.error);
        return;
      }
      nameDialog.close();
      resolve(result.data);
    }, { once: true });
  });
}

messageForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = messageInput.value.trim();
  if (!text || !currentUser || !currentProfile) return;
  sendButton.disabled = true;
  const { error } = await supabase.from("messages").insert({ user_id: currentUser.id, user_name: currentProfile.name, text });
  if (error) {
    console.error(error);
    showError(`Could not send message: ${error.message}`);
  } else {
    clearError();
    messageInput.value = "";
    messageInput.focus();
  }
  sendButton.disabled = false;
});

async function startChat() {
  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    let user = sessionData.session?.user;
    if (!user) {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
      user = data.user;
    }
    currentUser = user;
    currentProfile = await getOrCreateProfile(user);
    clearError();
    statusElement.textContent = `Online · ${currentProfile.name}`;
    messageInput.disabled = false;
    sendButton.disabled = false;
    await loadMessages();
    subscribeToMessages();
    messageInput.focus();
  } catch (error) {
    console.error("Supabase startup error:", error);
    showError(`Supabase setup error: ${error.message || "check Anonymous Auth, tables, and RLS policies"}`);
  }
}

startChat();
