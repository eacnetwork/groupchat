import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.43.0/+esm";

const SUPABASE_URL = "https://ublmdrosnkxwitoygxyq.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_z-TDvg8Lw2Ynz8j_VWRIpQ_9e7LhHJq";

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

const messagesElement = document.querySelector("#messages");
const messageForm = document.querySelector("#message-form");
const messageInput = document.querySelector("#message-input");
const sendButton = messageForm.querySelector("button");

const nameDialog = document.querySelector("#name-dialog");
const nameForm = document.querySelector("#name-form");
const nameInput = document.querySelector("#name-input");

const statusElement = document.querySelector("#connection-status");
const noticeElement = document.querySelector("#setup-notice");

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

  article.className = "message";

  if (currentUser && message.user_id === currentUser.id) {
    article.classList.add("mine");
  }

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  const author = document.createElement("strong");
  author.textContent = message.user_name || "Anonymous";

  const text = document.createElement("p");
  text.textContent = message.text;

  const time = document.createElement("time");

  if (message.created_at) {
    time.textContent = new Date(
      message.created_at
    ).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit"
    });
  }

  bubble.append(author, text, time);
  article.appendChild(bubble);
  messagesElement.appendChild(article);
}

async function loadMessages() {
  const { data, error } = await supabase
    .from("messages")
    .select("id, user_id, user_name, text, created_at")
    .order("created_at", {
      ascending: true
    })
    .limit(100);

  if (error) {
    console.error(error);
    showError("Could not load messages. Check your Supabase setup.");
    return;
  }

  messagesElement.replaceChildren();

  if (!data || data.length === 0) {
    messagesElement.innerHTML =
      "<p class='empty-state'>No messages yet. Say hello!</p>";
    return;
  }

  for (const message of data) {
    renderMessage(message);
  }

  messagesElement.scrollTop = messagesElement.scrollHeight;
}

function subscribeToMessages() {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
  }

  realtimeChannel = supabase
    .channel("public-messages")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages"
      },
      (payload) => {
        const emptyState = messagesElement.querySelector(".empty-state");

        if (emptyState) {
          emptyState.remove();
        }

        renderMessage(payload.new);
        messagesElement.scrollTop = messagesElement.scrollHeight;
      }
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        statusElement.textContent = `Online · ${currentProfile.name}`;
      }
    });
}

async function getOrCreateProfile(user) {
  const { data: existingProfile, error: profileError } = await supabase
    .from("profiles")
    .select("id, name")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    throw profileError;
  }

  if (existingProfile) {
    return existingProfile;
  }

  nameDialog.showModal();
  nameInput.focus();

  return new Promise((resolve, reject) => {
    nameForm.addEventListener(
      "submit",
      async (event) => {
        event.preventDefault();

        const name = nameInput.value.trim();

        if (!name) {
          nameInput.focus();
          return;
        }

        const { data, error } = await supabase
          .from("profiles")
          .insert({
            id: user.id,
            name
          })
          .select("id, name")
          .single();

        if (error) {
          console.error(error);
          alert("Could not save your name. Please try again.");
          reject(error);
          return;
        }

        nameDialog.close();
        resolve(data);
      },
      { once: true }
    );
  });
}

messageForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const text = messageInput.value.trim();

  if (!text || !currentUser || !currentProfile) {
    return;
  }

  sendButton.disabled = true;

  const { error } = await supabase
    .from("messages")
    .insert({
      user_id: currentUser.id,
      user_name: currentProfile.name,
      text
    });

  if (error) {
    console.error(error);
    showError("Your message could not be sent.");
  } else {
    clearError();
    messageInput.value = "";
    messageInput.focus();
  }

  sendButton.disabled = false;
});

async function startChat() {
  try {
    const {
      data: sessionData,
      error: sessionError
    } = await supabase.auth.getSession();

    if (sessionError) {
      throw sessionError;
    }

    let user = sessionData.session?.user;

    if (!user) {
      const {
        data: anonymousData,
        error: anonymousError
      } = await supabase.auth.signInAnonymously();

      if (anonymousError) {
        throw anonymousError;
      }

      user = anonymousData.user;
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
    console.error(error);
    showError(
      "Could not connect. Enable anonymous sign-ins in Supabase and check the database tables."
    );
  }
}

startChat();
