"""Shared strict client for Lanai's local CPU-backed Ollama inference runtime."""
from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

import requests

OLLAMA_BASE = os.getenv("OLLAMA_BASE_URL", "http://ollama:11434").rstrip("/")
DEFAULT_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:3b")
OLLAMA_TIMEOUT_SECONDS = int(os.getenv("OLLAMA_TIMEOUT_SECONDS", "180"))
OLLAMA_NUM_THREADS = int(os.getenv("OLLAMA_NUM_THREADS", "4"))
OLLAMA_CONTEXT_WINDOW = int(os.getenv("OLLAMA_CONTEXT_WINDOW", "4096"))

logger = logging.getLogger("lanai.ollama")


class OllamaInferenceError(RuntimeError):
    """Raised when the configured local inference runtime cannot produce a response."""


def ask(
    prompt: str,
    system: str = "",
    model: str = DEFAULT_MODEL,
    temperature: float = 0.3,
    max_tokens: int = 1024,
) -> str:
    """Return a real local-model completion or raise an explicit inference error."""
    payload: dict[str, Any] = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": temperature,
            "num_predict": max_tokens,
            "num_thread": OLLAMA_NUM_THREADS,
            "num_ctx": OLLAMA_CONTEXT_WINDOW,
        },
    }
    if system:
        payload["system"] = system
    try:
        response = requests.post(f"{OLLAMA_BASE}/api/generate", json=payload, timeout=OLLAMA_TIMEOUT_SECONDS)
        response.raise_for_status()
        output = str(response.json().get("response", "")).strip()
    except (requests.RequestException, ValueError) as error:
        logger.error("Ollama inference request failed: %s", error)
        raise OllamaInferenceError("Local AI inference runtime is unavailable") from error
    if not output:
        raise OllamaInferenceError("Local AI inference runtime returned an empty completion")
    return output


def ask_json(prompt: str, system: str = "", model: str = DEFAULT_MODEL) -> dict[str, Any]:
    """Return a parsed JSON local-model completion or raise a strict contract error."""
    json_system = (system + "\n\n" if system else "") + "Respond with valid JSON only, without markdown or explanation."
    raw = ask(prompt, system=json_system, model=model, temperature=0.1, max_tokens=2048).strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if not match:
            raise OllamaInferenceError("Local AI inference runtime did not return valid JSON")
        try:
            parsed = json.loads(match.group())
        except json.JSONDecodeError as error:
            raise OllamaInferenceError("Local AI inference runtime did not return valid JSON") from error
    if not isinstance(parsed, dict):
        raise OllamaInferenceError("Local AI inference runtime returned a non-object JSON response")
    return parsed


def health_check() -> bool:
    """Return whether the configured model is available from the configured local runtime."""
    try:
        response = requests.get(f"{OLLAMA_BASE}/api/tags", timeout=5)
        response.raise_for_status()
        models = [str(model.get("name", "")) for model in response.json().get("models", [])]
        return any(name == DEFAULT_MODEL or name.startswith(f"{DEFAULT_MODEL}:") for name in models)
    except (requests.RequestException, ValueError):
        return False
