"""
Lanai AI Core — Ollama Client
Provides a shared interface to the local Ollama llama3.2:3b model.
All pillars import from here.
"""
import requests
import json
import logging
from typing import Optional

OLLAMA_BASE = "http://localhost:11434"
DEFAULT_MODEL = "llama3.2:3b"

logger = logging.getLogger("lanai.ollama")


def ask(prompt: str, system: str = "", model: str = DEFAULT_MODEL, temperature: float = 0.3, max_tokens: int = 1024) -> str:
    """
    Send a prompt to the local Ollama model and return the response text.
    """
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": temperature,
            "num_predict": max_tokens,
        }
    }
    if system:
        payload["system"] = system

    try:
        resp = requests.post(f"{OLLAMA_BASE}/api/generate", json=payload, timeout=120)
        resp.raise_for_status()
        return resp.json().get("response", "").strip()
    except Exception as e:
        logger.error(f"Ollama request failed: {e}")
        return f"[AI Error: {e}]"


def ask_json(prompt: str, system: str = "", model: str = DEFAULT_MODEL) -> dict:
    """
    Ask Ollama for a JSON response. Returns parsed dict or error dict.
    """
    json_system = (system + "\n\n" if system else "") + "You MUST respond with valid JSON only. No explanation, no markdown, just raw JSON."
    raw = ask(prompt, system=json_system, model=model, temperature=0.1, max_tokens=2048)
    # Strip markdown code fences if present
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[-1]
        raw = raw.rsplit("```", 1)[0]
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # Try to extract JSON from the response
        import re
        match = re.search(r'\{.*\}', raw, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except:
                pass
        logger.error(f"Failed to parse JSON from Ollama: {raw[:200]}")
        return {"error": "Failed to parse JSON", "raw": raw[:500]}


def health_check() -> bool:
    """Check if Ollama is running and the model is available."""
    try:
        resp = requests.get(f"{OLLAMA_BASE}/api/tags", timeout=5)
        models = [m["name"] for m in resp.json().get("models", [])]
        return any(DEFAULT_MODEL in m for m in models)
    except:
        return False
