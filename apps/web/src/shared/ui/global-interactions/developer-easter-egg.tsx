"use client";

import { useEffect } from "react";

const DEVTOOLS_CAT = [
  " /\\     /\\",
  "{  `---'  }",
  "{  O   O  }",
  "~~>  V  <~~",
  " \\  \\|/  /",
  "  `-----'__",
  "  /     \\  `^\\_",
  " {       }\\ |\\_\\_   W",
  " |  \\_/  |/ /  \\_\\_( )",
  "  \\__/  /(_E     \\__/",
  "    (  /",
  "     MM",
].join("\n");

const EASTER_EGG_MARKER = "Felipe's AWS Labs cat";

export function DeveloperEasterEgg() {
  useEffect(() => {
    const existingComment = Array.from(document.body.childNodes).find(
      (node) =>
        node.nodeType === Node.COMMENT_NODE &&
        node.nodeValue?.includes(EASTER_EGG_MARKER),
    );

    if (existingComment) {
      return;
    }

    const comment = document.createComment(
      `\n${EASTER_EGG_MARKER}\n\n${DEVTOOLS_CAT}\n`,
    );
    document.body.prepend(comment);

    return () => {
      comment.remove();
    };
  }, []);

  return null;
}
