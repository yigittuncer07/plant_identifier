import os
import instructor
from openai import OpenAI
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

client = instructor.from_openai(
    OpenAI(
        base_url="https://api.eachlabs.ai/v1",
        api_key=os.getenv("EACHLABS_API_KEY"),
    ),
    mode=instructor.Mode.JSON
)

class IdentifyRequest(BaseModel):
    image_base64: str

class PlantIdentification(BaseModel):
    common_name: str = Field(description="Common name, or 'not a plant' if none found.")
    scientific_name: Optional[str]
    confidence: str = Field(description="'high', 'medium', or 'low'")
    description: Optional[str]
    care_tips: Optional[str]
    disambiguation: Optional[str] = Field(description="Top alternatives and photo suggestions if confidence is low. Null if high.")
    toxicity: Optional[str] = Field(description="Toxicity info, or 'unknown'.")

@app.post("/identify", response_model=PlantIdentification)
def identify_plant(request: IdentifyRequest):
    dummy_clear_img = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    dummy_blurry_img = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="

    try:
        plant_info = client.chat.completions.create(
            model="google/gemini-3.5-flash",
            response_model=PlantIdentification,
            max_retries=2,
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert plant identifier. Respond strictly to the schema."
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Identify this plant."},
                        {"type": "image_url", "image_url": {"url": dummy_clear_img}}
                    ]
                },
                {
                    "role": "assistant",
                    "content": '{"common_name": "Monstera", "scientific_name": "Monstera deliciosa", "confidence": "high", "description": "A popular houseplant with large, glossy, perforated leaves.", "care_tips": "Bright indirect light, let soil dry between waterings.", "disambiguation": null, "toxicity": "Toxic to pets if ingested"}'
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Identify this plant."},
                        {"type": "image_url", "image_url": {"url": dummy_blurry_img}}
                    ]
                },
                {
                    "role": "assistant",
                    "content": '{"common_name": "Unknown Plant", "scientific_name": null, "confidence": "low", "description": "The image is too blurry to definitively identify the plant.", "care_tips": null, "disambiguation": "Could be a Pothos or a Heartleaf Philodendron. Please provide a clear, well-lit photo of a single leaf and the stem to confirm.", "toxicity": "unknown"}'
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Identify this plant."},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{request.image_base64}"}}
                    ]
                }
            ]
        )
        return plant_info
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference error: {str(e)}")