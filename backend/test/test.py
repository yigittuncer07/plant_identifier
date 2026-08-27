#!/usr/bin/env python3
"""
Quick test script for sending an image to EachLabs' OpenAI-compatible
chat/completions endpoint, using a vision-capable model.

Usage:
    export EACHLABS_API_KEY=your_key_here
    python test_vision_call.py path/to/plant.jpg
    python test_vision_call.py path/to/plant.jpg --model google/gemini-3.5-flash
"""

import argparse
import base64
import mimetypes
import os
import sys
from dotenv import load_dotenv


import requests

load_dotenv()

DEFAULT_MODEL = "google/gemini-3.5-flash"
API_URL = "https://api.eachlabs.ai/v1/chat/completions"

DEFAULT_PROMPT = """You are identifying a plant from a photo. Respond with ONLY valid JSON,
no other text, matching this shape:

{
  "common_name": string,
  "scientific_name": string,
  "confidence": "high" | "medium" | "low",
  "description": string (1-2 sentences),
  "care_tips": string,
  "disambiguation": string or null (if confidence is not high, name the top
      alternative candidate(s) and suggest what would help confirm, e.g. a
      specific angle or plant part to photograph; null if confidence is high),
  "toxicity": string (toxic to pets/humans, or "unknown" if not confident)
}

If the image does not contain a plant, set common_name to "not a plant" and
leave the other fields as best-effort or null."""


def encode_image(path: str) -> str:
    mime_type, _ = mimetypes.guess_type(path)
    if mime_type is None:
        mime_type = "image/jpeg"
    with open(path, "rb") as f:
        b64_data = base64.b64encode(f.read()).decode("utf-8")
    return f"data:{mime_type};base64,{b64_data}"


def main():
    parser = argparse.ArgumentParser(description="Test EachLabs vision LLM call")
    parser.add_argument("image_path", help="Path to a local image file")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="Model id to use")
    parser.add_argument(
        "--prompt", default=DEFAULT_PROMPT, help="Override the default identification prompt"
    )
    args = parser.parse_args()

    api_key = os.environ.get("EACHLABS_API_KEY")
    if not api_key:
        print("Error: set the EACHLABS_API_KEY environment variable first.", file=sys.stderr)
        sys.exit(1)

    if not os.path.isfile(args.image_path):
        print(f"Error: no file found at {args.image_path}", file=sys.stderr)
        sys.exit(1)

    image_data_uri = encode_image(args.image_path)

    payload = {
        "model": args.model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": args.prompt},
                    {"type": "image_url", "image_url": {"url": image_data_uri}},
                ],
            }
        ],
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    print(f"Sending {args.image_path} to {args.model}...\n")
    response = requests.post(API_URL, headers=headers, json=payload, timeout=60)

    if response.status_code != 200:
        print(f"Request failed ({response.status_code}):", file=sys.stderr)
        print(response.text, file=sys.stderr)
        sys.exit(1)

    data = response.json()
    message = data["choices"][0]["message"]["content"]
    usage = data.get("usage", {})

    print("--- Model response ---")
    print(message)
    print("\n--- Usage ---")
    print(usage)


if __name__ == "__main__":
    main()