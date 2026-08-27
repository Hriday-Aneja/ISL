import React from "react";
import AvatarViewer from "../../../avatar/src/AvatarViewer";

export default function AvatarViewport() {
  return (
    <div
      style={{
        width: "100%",
        height: "600px",
        border: "2px solid red",
        background: "#222",
      }}
    >
      <AvatarViewer />
    </div>
  );
}