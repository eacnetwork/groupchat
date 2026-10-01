import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.43.0/+esm";

const SUPABASE_URL = "https://ublmdrosnkxwitoygxyq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_z-TDvg8Lw2Ynz8j_VWRIpQ_9e7LhHJq";

const ALLOWED_EMAILS = new Set([
  "23jameso@cheslynhay.windsoracademytrust.org.uk",
  "23bradyk@cheslynhay.windsoracademytrust.org.uk",
  "23taylorj@cheslynhay.windsoracademytrust.org.uk"
]);

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false
  }
});

const app = document.getElementById("app");
const authScreen = document.getElementById("auth-screen");
const authForm = document.getElementById("auth-form");
const emailInput = document.getElementById("email-input");
const passwordInput = document.getElementById("password-input");
const notice = document.getElementById("notice");
const messagesEl = document.getElementById("messages");
const composerForm = document.getElementById("composer-form");
const messageInput = document.getElementById("message-input");
const logoutButton = document.getElementById("logout-button");
const currentUserName = document.getElementById("current-user-name");
const currentUserEmail = document.getElementById("current-user-email");
const imageUpload = document.getElementById("image-upload");
const cameraUpload = document.getElementById("camera-upload");
const voiceToggle = document.getElementById("voice-toggle");

let currentUser = null;
let currentProfile = null;
let mediaRecorder = null;
let audioChunks = [];
let realtimeChannel = null;

function setNotice(text, isError = false) {
  notice.textContent = text;
  notice.classList.toggle("hidden", !text);
  notice.classList.toggle("error", isError);
}

function safeInitials(name, email) {
  if (name && name.trim()) {
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join("");
  }

  const base = (email || "User").split("@")[0];
  return base.slice(0, 2).toUpperCase();
}

function setUserBadge(name, email) {
  const initials = safeInitials(name, email);
  const avatar = document.querySelector(".avatar");
  if (avatar) avatar.textContent = initials;
  currentUserName.textContent = name || "User";
  currentUserEmail.textContent = email || "";
}

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (char) => {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };
    return map[char];
  });
}

function showApp() {
  app.classList.remove("hide");
  authScreen.classList.add("hide");
}

function showAuth() {
  app.classList.add("hide");
  authScreen.classList.remove("hide");
}

function renderMessage(message) {
  const article = document.createElement("article");
  article.className = `message ${message.user_id === currentUser?.id ? "mine" : ""}`;

  const meta = document.createElement("div");
  meta.className = "message-meta";
  meta.innerHTML = `
    <strong>${escapeHtml(message.user_name || "Unknown")}</strong>
    <span>${new Date(message.created_at).toLocaleString([], {
      dateStyle: "short",
      timeStyle: "short"
    })}</span>
  `;

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  if (message.text) {
    const text = document.createElement("p");
    text.className = "message-text";
    text.textContent = message.text;
    bubble.appendChild(text);
  }

  if (message.image_url) {
    const img = document.createElement("img");
    img.src = message.image_url;
    img.alt = "Shared image";
    img.loading = "lazy";
    bubble.appendChild(img);
  }

  if (message.voice_url) {
    const audio = document.createElement("audio");
    audio.controls = true;
    audio.src = message.voice_url;
    audio.className = "voice-player";
    bubble.appendChild(audio);
  }

  article.append(meta, bubble);
  messagesEl.appendChild(article);
}

async function loadMessages() {
  const { data, error } = await supabase
    .from("messages")
    .select("id, user_id, user_name, text, image_url, voice_url, created_at")
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) {
    console.error(error);
    setNotice("Messages could not be loaded.", true);
    return;
  }

  messagesEl.innerHTML = "";

  if (!data || data.length === 0) {
    messagesEl.innerHTML =
      "<div class='empty-state'>No messages yet. Start the conversation.</div>";
    return;
  }

  data.forEach(renderMessage);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function subscribeToMessages() {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
  }

  realtimeChannel = supabase
    .channel("private-room")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages"
      },
      (payload) => {
        const emptyState = messagesEl.querySelector(".empty-state");
        if (emptyState) emptyState.remove();

        renderMessage(payload.new);
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    )
    .subscribe();
}

async function uploadToStorage(file, folder) {
  const fileExt = file.name.split(".").pop();
  const randomName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
  const path = `${folder}/${randomName}`;

  const { data, error } = await supabase.storage.from("chat-media").upload(path, file, {
    cacheControl: "3600",
    upsert: false
  });

  if (error) throw error;

  const { data: publicUrlData } = supabase.storage
    .from("chat-media")
    .getPublicUrl(data.path);

  return publicUrlData.publicUrl;
}

async function handleMediaUpload(file, isVoice = false) {
  if (!file || !currentUser || !currentProfile) return;

  try {
    const folder = isVoice ? "voice" : "images";
    const fileUrl = await uploadToStorage(file, folder);

    const { error } = await supabase.from("messages").insert({
      user_id: currentUser.id,
      user_name: currentProfile.name,
      text: "",
      image_url: isVoice ? null : fileUrl,
      voice_url: isVoice ? fileUrl : null
    });

    if (error) throw error;

    setNotice("");
  } catch (error) {
    console.error(error);
    setNotice("Attachment failed to send.", true);
  }
}

imageUpload.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  await handleMediaUpload(file, false);
  imageUpload.value = "";
});

cameraUpload.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  await handleMediaUpload(file, false);
  cameraUpload.value = "";
});

async function startVoiceRecording() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setNotice("Voice notes are not supported in this browser.", true);
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    audioChunks = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) audioChunks.push(event.data);
    };

    recorder.onstop = async () => {
      const blob = new Blob(audioChunks, { type: "audio/webm" });
      const file = new File([blob], `voice-${Date.now()}.webm`, {
        type: "audio/webm"
      });

      await handleMediaUpload(file, true);

      stream.getTracks().forEach((track) => track.stop());
      voiceToggle.textContent = "Voice note";
      voiceToggle.classList.remove("recording");
    };

    mediaRecorder = recorder;
    recorder.start();
    voiceToggle.textContent = "Stop";
    voiceToggle.classList.add("recording");
    setNotice("Recording… Press again to stop.", false);

    voiceToggle.onclick = () => {
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
        return;
      }

      startVoiceRecording();
    };
  } catch (error) {
    console.error(error);
    setNotice("Microphone access was blocked.", true);
  }
}

voiceToggle.addEventListener("click", () => {
  if (!currentUser) return;

  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
    return;
  }

  startVoiceRecording();
});

composerForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const text = messageInput.value.trim();
  if (!text || !currentUser || !currentProfile) return;

  const { error } = await supabase.from("messages").insert({
    user_id: currentUser.id,
    user_name: currentProfile.name,
    text,
    image_url: null,
    voice_url: null
  });

  if (error) {
    console.error(error);
    setNotice("Your message did not send.", true);
    return;
  }

  messageInput.value = "";
  messageInput.style.height = "auto";
  setNotice("");
});

messageInput.addEventListener("input", () => {
  messageInput.style.height = "auto";
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 160)}px`;
});

async function signInOrCreateAccount(email, password) {
  const normalizedEmail = email.trim().toLowerCase();

  if (!ALLOWED_EMAILS.has(normalizedEmail)) {
    throw new Error("This email is not authorised for this private group.");
  }

  if (password.length < 6) {
    throw new Error("Password must be at least 6 characters.");
  }

  const signIn = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password
  });

  if (!signIn.error) {
    return signIn.data.user;
  }

  const signUp = await supabase.auth.signUp({
    email: normalizedEmail,
    password
  });

  if (signUp.error) {
    throw signUp.error;
  }

  return signUp.data.user;
}

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  try {
    setNotice("Checking your account…");
    const user = await signInOrCreateAccount(email, password);

    if (!user) {
      throw new Error("No user was returned.");
    }

    currentUser = user;

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("name")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) throw profileError;

    let profile = profileData;

    if (!profile) {
      const profileName = email.split("@")[0];
      const { data: newProfile, error: insertError } = await supabase
        .from("profiles")
        .insert({ id: user.id, name: profileName })
        .select("name")
        .single();

      if (insertError) throw insertError;
      profile = newProfile;
    }

    currentProfile = profile;
    setUserBadge(profile.name, currentUser.email);
    showApp();
    setNotice("");
    await loadMessages();
    subscribeToMessages();
  } catch (error) {
    console.error(error);
    setNotice(error.message || "Could not sign in.", true);
  }
});

logoutButton.addEventListener("click", async () => {
  await supabase.auth.signOut();
  currentUser = null;
  currentProfile = null;
  showAuth();
  emailInput.value = "";
  passwordInput.value = "";
  setNotice("");
});

(async function initialize() {
  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (session?.user) {
    currentUser = session.user;

    const { data: profileData } = await supabase
      .from("profiles")
      .select("name")
      .eq("id", currentUser.id)
      .maybeSingle();

    currentProfile = profileData || {
      name: currentUser.email?.split("@")[0] || "User"
    };

    setUserBadge(currentProfile.name, currentUser.email);
    showApp();
    await loadMessages();
    subscribeToMessages();
    return;
  }

  showAuth();
})();
