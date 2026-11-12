import { auth, db } from "./firebase-config.js";

import {
  RecaptchaVerifier, signInWithPhoneNumber, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

import {
  doc, setDoc, getDoc, collection, query, where, orderBy,
  onSnapshot, addDoc, serverTimestamp, updateDoc, limit
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const $ = id => document.getElementById(id);

let confirmation = null;
let recaptcha = null;
let currentUser = null;
let peer = null;
let stopMessages = null;
let stopIncoming = null;
let activeCall = null;
let pc = null;
let localStream = null;
let remoteStream = null;
let stopCallDoc = null;
let stopOfferCandidates = null;
let stopAnswerCandidates = null;

const servers = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("show");
  setTimeout(() => $("toast").classList.remove("show"), 3200);
}

function showError(message) {
  $("authError").textContent = message;
}

function pairId(a, b) {
  return [a, b].sort().join("__");
}

function initials(value) {
  return (value || "?").replace(/\D/g, "").slice(-2) || "?";
}

function formatTime(timestamp) {
  if (!timestamp?.toDate) return "";
  return timestamp.toDate().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

// PHONE OTP SIGN-IN
$("sendOtp").addEventListener("click", async () => {
  showError("");
  const phone = $("phone").value.trim();

  if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
    showError("Enter a valid phone number with country code, e.g. +919876543210.");
    return;
  }

  try {
    if (!recaptcha) {
      recaptcha = new RecaptchaVerifier(auth, "recaptcha-container", {
        size: "normal"
      });
      await recaptcha.render();
    }

    confirmation = await signInWithPhoneNumber(auth, phone, recaptcha);
    $("otpArea").hidden = false;
    toast("Verification code sent.");
  } catch (error) {
    showError(error.message);
    if (recaptcha) {
      try { await recaptcha.clear(); } catch {}
      recaptcha = null;
    }
  }
});

$("verifyOtp").addEventListener("click", async () => {
  try {
    if (!confirmation) throw new Error("Request a verification code first.");
    await confirmation.confirm($("otp").value.trim());
  } catch (error) {
    showError(error.message);
  }
});

$("signOut").addEventListener("click", () => signOut(auth));

// AUTH STATE
onAuthStateChanged(auth, async user => {
  currentUser = user;
  $("authView").hidden = !!user;
  $("mainView").hidden = !user;

  if (!user) {
    cleanup();
    return;
  }

  // The UID is the contact identifier in this privacy-preserving starter.
  $("myPhone").textContent =
    `${user.phoneNumber || "Signed in"} | ChatWave ID: ${user.uid}`;

  try {
    // User profile is private: only its owner can read it under current rules.
    await setDoc(doc(db, "users", user.uid), {
      uid: user.uid,
      phoneNumber: user.phoneNumber,
      lastSeen: serverTimestamp()
    }, { merge: true });

    listenIncomingCalls();
  } catch (error) {
    toast("Profile setup failed: " + error.message);
  }
});

// CONTACT LOOKUP BY UID
// Firestore rules intentionally prevent reading the entire private /users collection.
// Ask the other person to share their ChatWave ID, shown beside your phone number.
$("userSearch").addEventListener("input", () => {
  const uid = $("userSearch").value.trim();
  const list = $("usersList");
  list.replaceChildren();

  if (!uid) return;
  if (!currentUser) {
    list.textContent = "Please sign in first.";
    return;
  }
  if (uid === currentUser.uid) {
    list.textContent = "That is your own ChatWave ID.";
    return;
  }
  if (uid.length < 20) {
    list.textContent = "Enter the other person's full ChatWave ID.";
    return;
  }

  const button = document.createElement("button");
  button.className = "person";

  const info = document.createElement("span");
  info.className = "person-info";

  const name = document.createElement("strong");
  name.textContent = "Start chat";

  const status = document.createElement("small");
  status.textContent = "Chat with ID: " + uid;

  info.append(name, status);
  button.append(info);
  button.addEventListener("click", () => {
    openChat({ uid, phoneNumber: "ChatWave user" });
  });
  list.append(button);
});

// CHAT
async function openChat(user) {
  if (!currentUser || !user?.uid) return;
  if (user.uid === currentUser.uid) {
    toast("You cannot chat with yourself.");
    return;
  }

  peer = user;
  $("emptyState").hidden = true;
  $("chatPanel").hidden = false;
  $("peerName").textContent = user.phoneNumber || "ChatWave user";
  $("peerAvatar").textContent = initials(user.phoneNumber);
  $("peerStatus").textContent = "ChatWave user";

  if (stopMessages) stopMessages();
  stopMessages = null;

  const chatId = pairId(currentUser.uid, peer.uid);
  const members = [currentUser.uid, peer.uid].sort();

  try {
    // Create the parent chat before listening for or writing messages.
    // Sorted members keep the document identical for both participants.
    await setDoc(doc(db, "chats", chatId), {
      members,
      updatedAt: serverTimestamp()
    }, { merge: true });

    const messagesRef = collection(db, "chats", chatId, "messages");
    stopMessages = onSnapshot(
      query(messagesRef, orderBy("createdAt", "asc"), limit(300)),
      snapshot => {
        const box = $("messages");
        box.replaceChildren();

        snapshot.forEach(messageDoc => {
          const message = messageDoc.data();
          const bubble = document.createElement("div");
          bubble.className =
            "bubble " +
            (message.senderId === currentUser.uid ? "mine" : "theirs");

          const body = document.createElement("div");
          body.textContent = message.text || "";

          const time = document.createElement("small");
          time.textContent = formatTime(message.createdAt);

          bubble.append(body, time);
          box.append(bubble);
        });
        box.scrollTop = box.scrollHeight;
      },
      error => toast("Could not load messages: " + error.message)
    );
  } catch (error) {
    toast("Could not open chat: " + error.message);
  }
}

$("messageForm").addEventListener("submit", async event => {
  event.preventDefault();
  const messageText = $("messageInput").value.trim();
  if (!messageText || !peer || !currentUser) return;

  $("messageInput").value = "";

  try {
    const chatId = pairId(currentUser.uid, peer.uid);
    await addDoc(collection(db, "chats", chatId, "messages"), {
      text: messageText,
      senderId: currentUser.uid,
      recipientId: peer.uid,
      createdAt: serverTimestamp()
    });

    await setDoc(doc(db, "chats", chatId), {
      members: [currentUser.uid, peer.uid].sort(),
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (error) {
    toast("Message failed: " + error.message);
  }
});

// INCOMING CALLS
function listenIncomingCalls() {
  if (stopIncoming) stopIncoming();

  stopIncoming = onSnapshot(
    query(
      collection(db, "calls"),
      where("calleeId", "==", currentUser.uid),
      where("status", "==", "ringing")
    ),
    snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === "added") {
          showIncoming(change.doc.id, change.doc.data());
        }
      });
    },
    error => toast("Incoming-call listener: " + error.message)
  );
}

function showIncoming(callId, call) {
  activeCall = { id: callId, data: call, incoming: true };
  $("callOverlay").hidden = false;
  $("callTitle").textContent =
    call.type === "video" ? "Incoming video call" : "Incoming voice call";
  $("callSubtitle").textContent =
    "From " + (call.callerPhone || "ChatWave user");
  $("acceptCall").hidden = false;
  $("localVideo").hidden = call.type !== "video";
  $("remoteVideo").hidden = call.type !== "video";
}

$("voiceCall").addEventListener("click", () => startCall("audio"));
$("videoCall").addEventListener("click", () => startCall("video"));

async function prepareMedia(type) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera and microphone require a secure HTTPS website.");
  }

  localStream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: type === "video"
  });
  $("localVideo").srcObject = localStream;
}

// START CALL
async function startCall(type) {
  if (!peer || !currentUser) {
    toast("Open a chat first.");
    return;
  }

  try {
    activeCall = { id: null, incoming: false, type };
    $("callOverlay").hidden = false;
    $("callTitle").textContent =
      type === "video" ? "Starting video call…" : "Starting voice call…";
    $("callSubtitle").textContent =
      "Waiting for " + (peer.phoneNumber || "the other user");
    $("acceptCall").hidden = true;
    $("localVideo").hidden = type !== "video";
    $("remoteVideo").hidden = type !== "video";

    await prepareMedia(type);

    pc = new RTCPeerConnection(servers);
    remoteStream = new MediaStream();
    $("remoteVideo").srcObject = remoteStream;

    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    pc.ontrack = event => {
      event.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));
    };

    const callRef = doc(collection(db, "calls"));
    activeCall.id = callRef.id;

    // Parent call doc must exist before its ICE candidate subcollection is written.
    await setDoc(callRef, {
      callerId: currentUser.uid,
      callerPhone: currentUser.phoneNumber || "",
      calleeId: peer.uid,
      calleePhone: peer.phoneNumber || "",
      type,
      status: "preparing",
      createdAt: serverTimestamp()
    });

    const offerCandidates = collection(callRef, "offerCandidates");
    pc.onicecandidate = event => {
      if (event.candidate) {
        addDoc(offerCandidates, event.candidate.toJSON())
          .catch(error => toast("ICE candidate error: " + error.message));
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await updateDoc(callRef, {
      offer: { type: offer.type, sdp: offer.sdp },
      status: "ringing"
    });

    stopCallDoc = onSnapshot(callRef, async snapshot => {
      const data = snapshot.data();
      if (!data) return;

      if (data.answer && pc && !pc.currentRemoteDescription) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        $("callTitle").textContent = "Connected";
        $("callSubtitle").textContent = peer?.phoneNumber || "In call";
      }
      if (data.status === "ended") endCall(false);
    });

    stopAnswerCandidates = onSnapshot(
      collection(callRef, "answerCandidates"),
      snapshot => {
        snapshot.docChanges().forEach(change => {
          if (change.type === "added" && pc) {
            pc.addIceCandidate(new RTCIceCandidate(change.doc.data())).catch(() => {});
          }
        });
      }
    );
  } catch (error) {
    toast("Could not start call: " + error.message);
    endCall(false);
  }
}

// ANSWER CALL
$("acceptCall").addEventListener("click", async () => {
  if (!activeCall?.incoming) return;

  try {
    const callRef = doc(db, "calls", activeCall.id);
    const callSnapshot = await getDoc(callRef);
    if (!callSnapshot.exists()) throw new Error("This call is no longer available.");

    const callData = callSnapshot.data();
    await prepareMedia(callData.type);

    pc = new RTCPeerConnection(servers);
    remoteStream = new MediaStream();
    $("remoteVideo").srcObject = remoteStream;

    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    pc.ontrack = event => {
      event.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));
    };

    pc.onicecandidate = event => {
      if (event.candidate) {
        addDoc(
          collection(callRef, "answerCandidates"),
          event.candidate.toJSON()
        ).catch(error => toast("ICE candidate error: " + error.message));
      }
    };

    await pc.setRemoteDescription(new RTCSessionDescription(callData.offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    await updateDoc(callRef, {
      answer: { type: answer.type, sdp: answer.sdp },
      status: "accepted"
    });

    stopOfferCandidates = onSnapshot(
      collection(callRef, "offerCandidates"),
      snapshot => {
        snapshot.docChanges().forEach(change => {
          if (change.type === "added" && pc) {
            pc.addIceCandidate(new RTCIceCandidate(change.doc.data())).catch(() => {});
          }
        });
      }
    );

    stopCallDoc = onSnapshot(callRef, snapshot => {
      if (snapshot.data()?.status === "ended") endCall(false);
    });

    $("acceptCall").hidden = true;
    $("callTitle").textContent = "Connected";
    $("callSubtitle").textContent = callData.callerPhone || "In call";
  } catch (error) {
    toast("Could not answer: " + error.message);
    endCall(false);
  }
});

// CALL CONTROLS
$("muteCall").addEventListener("click", () => {
  const track = localStream?.getAudioTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  $("muteCall").classList.toggle("active", !track.enabled);
});

$("cameraCall").addEventListener("click", () => {
  const track = localStream?.getVideoTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  $("cameraCall").classList.toggle("active", !track.enabled);
});

$("hangupCall").addEventListener("click", () => endCall(true));

async function endCall(updateServer) {
  const callId = activeCall?.id;

  if (updateServer && callId) {
    try {
      await updateDoc(doc(db, "calls", callId), {
        status: "ended",
        endedAt: serverTimestamp()
      });
    } catch {}
  }

  [stopCallDoc, stopOfferCandidates, stopAnswerCandidates].forEach(stop => {
    if (stop) stop();
  });
  stopCallDoc = stopOfferCandidates = stopAnswerCandidates = null;

  if (pc) pc.close();
  pc = null;

  if (localStream) localStream.getTracks().forEach(track => track.stop());
  localStream = null;
  remoteStream = null;

  $("localVideo").srcObject = null;
  $("remoteVideo").srcObject = null;
  $("callOverlay").hidden = true;
  $("acceptCall").hidden = true;
  activeCall = null;
}

function cleanup() {
  if (stopMessages) stopMessages();
  if (stopIncoming) stopIncoming();
  stopMessages = null;
  stopIncoming = null;
  peer = null;
  endCall(true);
}

// Service workers require HTTPS (or localhost).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
