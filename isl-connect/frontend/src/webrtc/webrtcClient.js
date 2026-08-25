// Minimal 2-peer WebRTC setup. Needs a signaling channel (WebSocket) to
// exchange offer/answer/ICE candidates — stub one out or use a small
// signaling server for the hackathon.

export function createPeerConnection(onRemoteStream) {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });

  pc.ontrack = (event) => {
    onRemoteStream(event.streams[0]);
  };

  return pc;
}

export async function getLocalStream() {
  return navigator.mediaDevices.getUserMedia({ video: true, audio: true });
}
