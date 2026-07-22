"use strict";

/* ============================================================
   Dynamic cursor + constellation background
   ============================================================ */
(function initCursorFX() {
  const isCoarse = window.matchMedia("(hover: none), (pointer: coarse)").matches;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (isCoarse || reduced) return;

  const dot = document.getElementById("cursor-dot");
  const ring = document.getElementById("cursor-ring");
  const canvas = document.getElementById("constellation");
  const ctx = canvas.getContext("2d");

  let mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  let ringPos = { ...mouse };

  function resize() {
    canvas.width = window.innerWidth * devicePixelRatio;
    canvas.height = window.innerHeight * devicePixelRatio;
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  // Ambient particles ("knowledge nodes") that drift, plus a trail that
  // follows the pointer and connects nearby nodes — a small constellation
  // forming wherever the learner's attention goes.
  const NODE_COUNT = 46;
  const nodes = Array.from({ length: NODE_COUNT }, () => ({
    x: Math.random() * window.innerWidth,
    y: Math.random() * window.innerHeight,
    vx: (Math.random() - 0.5) * 0.15,
    vy: (Math.random() - 0.5) * 0.15,
    r: Math.random() * 1.4 + 0.6,
  }));

  const trail = [];
  const TRAIL_MAX = 14;

  window.addEventListener("mousemove", (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    trail.push({ x: e.clientX, y: e.clientY });
    if (trail.length > TRAIL_MAX) trail.shift();

    const target = e.target.closest(
      "button, a, input, textarea, select, .chip, .quiz-option"
    );
    ring.classList.toggle("hovering", !!target);
  });

  function tick() {
    ringPos.x += (mouse.x - ringPos.x) * 0.18;
    ringPos.y += (mouse.y - ringPos.y) * 0.18;
    dot.style.transform = `translate(${mouse.x}px, ${mouse.y}px) translate(-50%, -50%)`;
    ring.style.transform = `translate(${ringPos.x}px, ${ringPos.y}px) translate(-50%, -50%)`;

    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    // Drift ambient nodes
    for (const n of nodes) {
      n.x += n.vx;
      n.y += n.vy;
      if (n.x < 0 || n.x > window.innerWidth) n.vx *= -1;
      if (n.y < 0 || n.y > window.innerHeight) n.vy *= -1;
    }

    // Connect nearby ambient nodes faintly
    ctx.lineWidth = 1;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const dist = Math.hypot(dx, dy);
        if (dist < 130) {
          ctx.strokeStyle = `rgba(94, 234, 212, ${0.06 * (1 - dist / 130)})`;
          ctx.beginPath();
          ctx.moveTo(nodes[i].x, nodes[i].y);
          ctx.lineTo(nodes[j].x, nodes[j].y);
          ctx.stroke();
        }
      }
    }
    for (const n of nodes) {
      ctx.fillStyle = "rgba(232, 233, 243, 0.25)";
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Connect cursor trail to nearby ambient nodes — the "constellation" signature
    trail.forEach((p, idx) => {
      const alpha = (idx / trail.length) * 0.5;
      for (const n of nodes) {
        const dist = Math.hypot(p.x - n.x, p.y - n.y);
        if (dist < 90) {
          ctx.strokeStyle = `rgba(255, 200, 87, ${alpha * (1 - dist / 90)})`;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(n.x, n.y);
          ctx.stroke();
        }
      }
    });

    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();

/* ============================================================
   App state
   ============================================================ */
const state = {
  subject: null,
  chatHistory: [], // {role, content}
  quiz: null,      // {questions: [...]}
  quizIndex: 0,
  quizScore: 0,
};

const el = {
  subjectForm: document.getElementById("subject-form"),
  subjectInput: document.getElementById("subject-input"),
  chipRow: document.querySelector(".chip-row"),
  activeSubjectBox: document.getElementById("active-subject"),
  activeSubjectName: document.getElementById("active-subject-name"),
  changeSubjectBtn: document.getElementById("change-subject-btn"),
  mainPanel: document.getElementById("main-panel"),

  modeBtns: document.querySelectorAll(".mode-btn"),
  chatView: document.getElementById("chat-view"),
  quizView: document.getElementById("quiz-view"),

  chatLog: document.getElementById("chat-log"),
  chatForm: document.getElementById("chat-form"),
  chatInput: document.getElementById("chat-input"),

  quizSubjectLine: document.getElementById("quiz-subject-line"),
  quizSetup: document.getElementById("quiz-setup"),
  topicInput: document.getElementById("topic-input"),
  numQ: document.getElementById("num-q"),
  difficulty: document.getElementById("difficulty"),
  generateBtn: document.getElementById("generate-quiz-btn"),
  quizError: document.getElementById("quiz-error"),
  quizRunner: document.getElementById("quiz-runner"),
  quizProgressText: document.getElementById("quiz-progress-text"),
  quizRestartBtn: document.getElementById("quiz-restart-btn"),
  quizCard: document.getElementById("quiz-question-card"),
  quizScoreBox: document.getElementById("quiz-score"),
  quizLoading: document.getElementById("quiz-loading"),
};

/* ============================================================
   Subject search
   ============================================================ */
function setSubject(subject) {
  state.subject = subject.trim();
  el.subjectInput.value = state.subject;
  el.activeSubjectName.textContent = state.subject;
  el.activeSubjectBox.classList.remove("hidden");
  el.mainPanel.classList.remove("hidden");
  el.quizSubjectLine.textContent = `Building your quiz on "${state.subject}".`;

  el.chatLog.innerHTML = "";
  appendMessage(
    "assistant",
    `Let's dive into ${state.subject}. Ask me anything — a concept you're stuck on, an exam-style question, or "explain this with an example."`
  );
  state.chatHistory = [];

  // Reset quiz to setup state for the new subject
  state.quiz = null;
  el.quizSetup.classList.remove("hidden");
  el.quizRunner.classList.add("hidden");
  el.quizError.textContent = "";
  el.topicInput.value = "";

  el.mainPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

el.subjectForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const val = el.subjectInput.value.trim();
  if (val) setSubject(val);
});

el.chipRow.addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (chip) setSubject(chip.dataset.subject);
});

el.changeSubjectBtn.addEventListener("click", () => {
  el.mainPanel.classList.add("hidden");
  el.activeSubjectBox.classList.add("hidden");
  el.subjectInput.value = "";
  el.subjectInput.focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

/* ============================================================
   Mode switching
   ============================================================ */
el.modeBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    el.modeBtns.forEach((b) => {
      b.classList.remove("active");
      b.setAttribute("aria-selected", "false");
    });
    btn.classList.add("active");
    btn.setAttribute("aria-selected", "true");

    const mode = btn.dataset.mode;
    el.chatView.classList.toggle("active", mode === "chat");
    el.quizView.classList.toggle("active", mode === "quiz");
  });
});

/* ============================================================
   Chat (streaming)
   ============================================================ */
function appendMessage(role, content) {
  const wrap = document.createElement("div");
  wrap.className = `msg msg-${role}`;
  const label = document.createElement("div");
  label.className = "msg-label";
  label.textContent = role === "user" ? "You" : "Cognita";
  const body = document.createElement("div");
  body.className = "msg-body";
  body.textContent = content;
  wrap.appendChild(label);
  wrap.appendChild(body);
  el.chatLog.appendChild(wrap);
  el.chatLog.scrollTop = el.chatLog.scrollHeight;
  return body;
}

function autoGrow() {
  el.chatInput.style.height = "auto";
  el.chatInput.style.height = Math.min(el.chatInput.scrollHeight, 140) + "px";
}
el.chatInput.addEventListener("input", autoGrow);

el.chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = el.chatInput.value.trim();
  if (!text) return;

  appendMessage("user", text);
  state.chatHistory.push({ role: "user", content: text });
  el.chatInput.value = "";
  autoGrow();

  const assistantBody = appendMessage("assistant", "");
  let full = "";

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: state.subject, messages: state.chatHistory }),
    });

    if (!res.ok || !res.body) throw new Error("Request failed");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n\n");
      buffer = lines.pop(); // keep incomplete chunk

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (payload === "[DONE]") continue;
        try {
          const parsed = JSON.parse(payload);
          if (parsed.token) {
            full += parsed.token;
            assistantBody.textContent = full;
            el.chatLog.scrollTop = el.chatLog.scrollHeight;
          } else if (parsed.error) {
            throw new Error(parsed.error);
          }
        } catch (_) {
          /* ignore partial JSON */
        }
      }
    }

    state.chatHistory.push({ role: "assistant", content: full });
  } catch (err) {
    assistantBody.textContent =
      "Something went wrong reaching the AI service. Please try again.";
  }
});

/* ============================================================
   Quiz
   ============================================================ */
el.generateBtn.addEventListener("click", async () => {
  el.quizError.textContent = "";
  el.quizSetup.classList.add("hidden");
  el.quizLoading.classList.remove("hidden");

  try {
    const res = await fetch("/api/quiz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: state.subject,
        topic: el.topicInput.value.trim() || null,
        num_questions: Number(el.numQ.value),
        difficulty: el.difficulty.value,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Could not generate the quiz.");
    }

    const data = await res.json();
    if (!data.questions || !data.questions.length) throw new Error("No questions returned.");

    state.quiz = data.questions;
    state.quizIndex = 0;
    state.quizScore = 0;

    el.quizLoading.classList.add("hidden");
    el.quizRunner.classList.remove("hidden");
    renderQuestion();
  } catch (err) {
    el.quizLoading.classList.add("hidden");
    el.quizSetup.classList.remove("hidden");
    el.quizError.textContent = err.message;
  }
});

function renderQuestion() {
  const q = state.quiz[state.quizIndex];
  el.quizProgressText.textContent = `Question ${state.quizIndex + 1} of ${state.quiz.length}`;
  el.quizScoreBox.classList.add("hidden");

  const letters = ["A", "B", "C", "D", "E", "F"];
  el.quizCard.innerHTML = "";

  const qEl = document.createElement("p");
  qEl.className = "quiz-question";
  qEl.textContent = q.question;
  el.quizCard.appendChild(qEl);

  q.options.forEach((opt, i) => {
    const btn = document.createElement("button");
    btn.className = "quiz-option";
    btn.type = "button";
    btn.innerHTML = `<span class="opt-letter">${letters[i]}</span><span>${escapeHTML(opt)}</span>`;
    btn.addEventListener("click", () => selectAnswer(i));
    el.quizCard.appendChild(btn);
  });
}

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function selectAnswer(choiceIndex) {
  const q = state.quiz[state.quizIndex];
  const buttons = el.quizCard.querySelectorAll(".quiz-option");
  buttons.forEach((b) => (b.disabled = true));

  buttons[choiceIndex].classList.add(choiceIndex === q.correct_index ? "correct" : "incorrect");
  if (choiceIndex !== q.correct_index) {
    buttons[q.correct_index].classList.add("correct");
  } else {
    state.quizScore += 1;
  }

  if (q.explanation) {
    const exp = document.createElement("div");
    exp.className = "quiz-explanation";
    exp.textContent = q.explanation;
    el.quizCard.appendChild(exp);
  }

  const row = document.createElement("div");
  row.className = "quiz-next-row";
  const nextBtn = document.createElement("button");
  nextBtn.className = "primary-btn";
  nextBtn.type = "button";
  nextBtn.textContent =
    state.quizIndex < state.quiz.length - 1 ? "Next question" : "See results";
  nextBtn.addEventListener("click", advanceQuiz);
  row.appendChild(nextBtn);
  el.quizCard.appendChild(row);
}

function advanceQuiz() {
  state.quizIndex += 1;
  if (state.quizIndex >= state.quiz.length) {
    showScore();
  } else {
    renderQuestion();
  }
}

function showScore() {
  el.quizCard.innerHTML = "";
  el.quizProgressText.textContent = "Complete";
  el.quizScoreBox.classList.remove("hidden");
  el.quizScoreBox.innerHTML = `
    <p class="score-number">${state.quizScore} / ${state.quiz.length}</p>
    <p class="score-label">Nice work. Generate another quiz to keep going.</p>
  `;
  const retryBtn = document.createElement("button");
  retryBtn.className = "primary-btn";
  retryBtn.type = "button";
  retryBtn.textContent = "New quiz";
  retryBtn.addEventListener("click", resetQuizToSetup);
  el.quizScoreBox.appendChild(retryBtn);
}

function resetQuizToSetup() {
  state.quiz = null;
  el.quizRunner.classList.add("hidden");
  el.quizSetup.classList.remove("hidden");
}

el.quizRestartBtn.addEventListener("click", resetQuizToSetup);
