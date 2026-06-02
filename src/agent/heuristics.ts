function goalKeywords(goal: string | null): string[] {
  const stop = new Set([
    "open", "run", "find", "best", "video", "the", "which", "for", "and", "a", "an", "on", "to", "go", "watch", "play", "youtube", "search"
  ]);
  return (goal || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stop.has(w));
}

function lastHistoryAction(history: any[]): any {
  return history.length ? history[history.length - 1] : null;
}

function hadAction(history: any[], action: string): boolean {
  return history.some((h) => h.action === action);
}

function scoreMatch(text: string | null | undefined, keywords: string[]): number {
  const t = (text || "").toLowerCase();
  return keywords.reduce((n, k) => (t.includes(k) ? n + 1 : n), 0);
}

function extractEmailDetails(goal: string): { recipient: string; subject: string; body: string } {
  const g = goal || "";
  let recipient = "";
  let subject = "";
  let body = "";

  // 1. Extract email recipient
  const emailMatch = g.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
  if (emailMatch) {
    recipient = emailMatch[0];
  }

  // 2. Extract Body
  const bodyQuotes = g.match(/(?:body|message|content|text|draft)[\s\S]*?['"]([^'"]+)['"]/i);
  const bodyAfterTo = g.match(/(?:body|message|content|text|draft)[\s\S]*?\bto\s+([\s\S]+)$/i);
  const bodyColon = g.match(/(?:body|message|content|text|draft)\s*:\s*([\s\S]+)$/i);
  const bodyGeneral = g.match(/(?:body|message|content|text|draft)\s+(?:is\s+)?([\s\S]+)$/i);

  if (bodyQuotes) {
    body = bodyQuotes[1].trim();
  } else if (bodyAfterTo) {
    body = bodyAfterTo[1].trim();
  } else if (bodyColon) {
    body = bodyColon[1].trim();
  } else if (bodyGeneral) {
    body = bodyGeneral[1].trim();
  }

  // 3. Extract Subject
  const subjectQuotes = g.match(/(?:subject|regarding|about)[\s\S]*?['"]([^'"]+)['"]/i);
  const subjectColon = g.match(/(?:subject|regarding|about)\s*:\s*([^\n\r.]+)/i);
  const subjectGeneral = g.match(/(?:subject|regarding|about)\s+(?:is\s+)?([A-Za-z0-9\s]+?)(?:\s+body|\s+with|\s+and|\s+message|$)/i);
  
  if (subjectQuotes) {
    subject = subjectQuotes[1].trim();
  } else if (subjectColon) {
    subject = subjectColon[1].trim();
  } else if (subjectGeneral) {
    subject = subjectGeneral[1].trim();
  }

  // Clean ups
  if (subject && recipient && subject.toLowerCase().includes(recipient.toLowerCase())) {
    subject = "";
  }

  // Fallbacks
  if (!subject && g.toLowerCase().includes("good night")) {
    subject = "Good Night Greetings";
  }
  if (!body && g.toLowerCase().includes("good night")) {
    body = "Good Night! Wishing you a peaceful night";
  }

  return { recipient, subject, body };
}

export function getHeuristicHint(
  snapshot: any,
  goal: string,
  history: any[]
): { hint: string | null; autoAction: any | null } {
  const url = (snapshot.url || "").toLowerCase();
  const hints: string[] = [];
  let autoAction: any = null;

  if (!url.includes("youtube.com") && !url.includes("mail.google.com")) {
    return { hint: null, autoAction: null };
  }

  const interactables = snapshot.interactables || [];

  if (url.includes("mail.google.com")) {
    const details = extractEmailDetails(goal);
    
    const subjectField = interactables.find(
      (i: any) => i.placeholder?.includes("Subject") || (i.tag === "input" && i.name === "subjectbox")
    );
    const bodyField = interactables.find(
      (i: any) => i.role === "textbox" && (i.text?.toLowerCase().includes("message body") || i.placeholder?.toLowerCase().includes("message body"))
    );

    const hasComposeOpen = !!subjectField;

    if (!hasComposeOpen) {
      const composeBtn = interactables.find(
        (i: any) => i.text?.toLowerCase().includes("compose")
      );
      if (composeBtn) {
        hints.push("To start, click the 'Compose' button to open a new mail drafting window.");
        autoAction = { action: "click", elementId: composeBtn.id };
      }
    } else {
      const recipientField = interactables.find(
        (i: any) => i.tag === "input" && !i.placeholder?.includes("Subject") && i.name !== "subjectbox" && !i.id?.includes("search")
      );
      const sendBtn = interactables.find(
        (i: any) => i.text?.toLowerCase() === "send" || (i.role === "button" && i.text?.toLowerCase().includes("send"))
      );
      
      const currentRecipient = (recipientField?.value || "").trim();
      const currentSubject = (subjectField?.value || "").trim();
      const currentBody = (bodyField?.value || bodyField?.text || "").trim();

      if (details.recipient && currentRecipient.toLowerCase() !== details.recipient.toLowerCase()) {
        hints.push(`Typing recipient: ${details.recipient}`);
        autoAction = { action: "type", elementId: recipientField.id, value: details.recipient, submit: false };
      } else if (details.subject && currentSubject.toLowerCase() !== details.subject.toLowerCase()) {
        hints.push(`Typing subject: ${details.subject}`);
        autoAction = { action: "type", elementId: subjectField.id, value: details.subject, submit: false };
      } else if (details.body && currentBody.replace(/\s+/g, " ") !== details.body.replace(/\s+/g, " ") && bodyField) {
        if (bodyField.focused) {
          hints.push(`Typing body content: ${details.body}`);
          autoAction = { action: "type", elementId: bodyField.id, value: details.body, submit: false };
        } else {
          hints.push("Clicking message body field to shift focus.");
          autoAction = { action: "click", elementId: bodyField.id };
        }
      } else if (goal.toLowerCase().includes("send") && sendBtn) {
        hints.push("All details filled. Clicking the Send button to send the email.");
        autoAction = { action: "click", elementId: sendBtn.id };
      } else {
        hints.push("Draft complete according to goal requirements.");
        autoAction = { action: "done", result: `Draft completed. Recipient: ${currentRecipient}, Subject: ${currentSubject}, Body: ${currentBody}` };
      }
    }

    return {
      hint: hints.length ? hints.join(" ") : null,
      autoAction
    };
  }

  const keywords = goalKeywords(goal);
  const last = lastHistoryAction(history);

  const searchEl = interactables.find(
    (i: any) =>
      (i.tag === "input" || i.role === "combobox" || i.role === "searchbox") &&
      (i.type === "search" || /search/i.test(`${i.placeholder}${i.text}${i.id}`))
  );

  const searchFilled = searchEl && (searchEl.value || "").trim().length > 0;
  const onResults = url.includes("search_query=") || url.includes("/results");
  const onWatch = url.includes("/watch");

  if (searchFilled && !hadAction(history, "press") && last?.action === "type") {
    hints.push("Search box has text — submit with press (Enter) or click the search button next.");
    autoAction = { action: "press", elementId: searchEl.id, value: "Enter" };
  } else if (searchEl && !searchFilled && !onResults && !onWatch) {
    hints.push("Type the query in the search box, use submit:true or press Enter, then open a result video.");
  }

  if (onResults && !onWatch) {
    hints.push("On results page — click the best matching video title link (a with video title text).");
    const videos = interactables.filter(
      (i: any) =>
        i.tag === "a" &&
        i.href &&
        (i.href.includes("/watch") || /#video-title|video/i.test(i.id || "")) &&
        (keywords.length === 0 || keywords.some((k) => (i.text || "").toLowerCase().includes(k)))
    );
    if (videos.length && !hadAction(history, "click")) {
      const sorted = [...videos].sort((a, b) => scoreMatch(b.text, keywords) - scoreMatch(a.text, keywords));
      const best = sorted[0];
      if (scoreMatch(best.text, keywords) > 0 || keywords.length === 0) {
        autoAction = autoAction || { action: "click", elementId: best.id };
      }
    }
  }

  if (onWatch) {
    hints.push("Video page open — confirm playback started, then use done with the video title in result.");
  }

  return {
    hint: hints.length ? hints.join(" ") : null,
    autoAction
  };
}

export function shouldRunAutoAction(autoAction: any | null, history: any[]): boolean {
  if (!autoAction) return false;

  if (history.length > 0) {
    const last = history[history.length - 1];
    const lastDetail = last.detail || "";
    const targetIndicator = autoAction.elementId || autoAction.url || "";

    if (last.action === autoAction.action && (targetIndicator && lastDetail.includes(targetIndicator))) {
      return false;
    }
  }

  return true;
}
