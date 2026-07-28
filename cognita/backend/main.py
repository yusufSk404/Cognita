
import json
import os
from pathlib import Path
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from openai import OpenAI
from pydantic import BaseModel

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "llama-3.3-70b-versatile")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.groq.com/openai/v1")

if not OPENAI_API_KEY:
    print("WARNING: OPENAI_API_KEY is not set. Set it in your .env file or "
          "as an environment variable before making requests.")

client = OpenAI(api_key=OPENAI_API_KEY, base_url=OPENAI_BASE_URL) if OPENAI_API_KEY else None

app = FastAPI(title="Cognita")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

SYSTEM_PROMPT = (
    "You are Cognita, a patient and encouraging AI study companion. You can "
    "teach or discuss any subject the learner brings to you — from computer "
    "science and mathematics to history, language, or professional exam "
    "prep. Explain concepts clearly, use short worked examples where "
    "helpful, and keep answers focused on genuine understanding rather than "
    "padding. When asked to quiz the learner, ask one question at a time "
    "and wait for their answer before revealing the correct one."
)


class ChatMessage(BaseModel):
    role: str  
    content: str


class ChatRequest(BaseModel):
    subject: Optional[str] = None
    messages: List[ChatMessage]


class QuizRequest(BaseModel):
    subject: str
    topic: Optional[str] = None
    num_questions: int = 5
    difficulty: str = "medium"  


def build_messages(req: ChatRequest):
    system = SYSTEM_PROMPT
    if req.subject:
        system += f" The learner is currently studying: {req.subject}."
    msgs = [{"role": "system", "content": system}]
    msgs += [{"role": m.role, "content": m.content} for m in req.messages]
    return msgs


@app.post("/api/chat")
async def chat(req: ChatRequest):
    """Streams the tutor's reply back to the browser as Server-Sent Events."""
    if client is None:
        raise HTTPException(status_code=500, detail="Server is missing OPENAI_API_KEY.")

    def event_stream():
        try:
            stream = client.chat.completions.create(
                model=OPENAI_MODEL,
                messages=build_messages(req),
                stream=True,
                temperature=0.4,
            )
            for chunk in stream:
                delta = chunk.choices[0].delta.content if chunk.choices else None
                if delta:
                   
                    yield f"data: {json.dumps({'token': delta})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as exc: 
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/api/quiz")
async def generate_quiz(req: QuizRequest):
    """Returns a structured multiple-choice quiz as JSON (non-streaming).

    The subject is entirely free-form (whatever the learner searches for),
    and the topic is optional — if left blank, the model chooses a sensible
    spread of key topics within the subject itself.
    """
    if client is None:
        raise HTTPException(status_code=500, detail="Server is missing OPENAI_API_KEY.")

    topic_clause = (
        f"narrowly focused on the topic '{req.topic}' within that subject"
        if req.topic and req.topic.strip()
        else "covering a well-rounded spread of the subject's most important topics"
    )

    prompt = (
        f"Create {req.num_questions} multiple-choice questions on the subject "
        f"'{req.subject}', {topic_clause}, at {req.difficulty} difficulty. "
        "Respond ONLY with valid JSON, no markdown fences, in this exact shape: "
        '{"questions": [{"question": "...", "options": ["A", "B", "C", "D"], '
        '"correct_index": 0, "explanation": "..."}]}'
    )

    try:
        completion = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": "You output only valid JSON. No prose, no markdown fences."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.5,
        )
        raw = completion.choices[0].message.content.strip()
        raw = raw.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        data = json.loads(raw)
        return data
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="Model returned malformed JSON. Try again.")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/health")
async def health():
    return {"status": "ok", "model": OPENAI_MODEL, "api_key_configured": client is not None}



FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
