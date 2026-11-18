import type { ContentMessage } from "../shared/messages";
import { start } from "./app";
import { send } from "./reader";

if (document.contentType === "application/pdf") {
  // Chrome's PDF viewer exposes no text, so a command here reopens the file in Clipperzinho's own viewer.
  chrome.runtime.onMessage.addListener((message: ContentMessage) => {
    if (message.type.startsWith("command/")) void send({ type: "pdf/open", url: location.href });
  });
} else {
  start();
}
