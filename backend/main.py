import os
import time
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

class PlantHealth(BaseModel):
    status: str = Field(description="'healthy', 'diseased', or 'pest_infestation'")
    diagnosis: Optional[str] = Field(description="Describe the disease or pest issue if any")
    treatment: Optional[str] = Field(description="How to treat the issue if any")

class PlantIdentification(BaseModel):
    common_name: str = Field(description="Common name, or 'not a plant' if none found.")
    scientific_name: Optional[str]
    confidence: str = Field(description="'high', 'medium', or 'low'")
    description: Optional[str]
    watering_frequency_days: Optional[int]
    sunlight_requirement: Optional[str] = Field(description="'direct', 'indirect', or 'low'")
    difficulty_level: Optional[str] = Field(description="'easy', 'moderate', or 'expert'")
    plant_health: Optional[PlantHealth]
    disambiguation: Optional[str] = Field(description="Top alternatives and photo suggestions if confidence is low. Null if high.")
    toxicity: Optional[str] = Field(description="e.g. 'Toxic to pets' or 'Non-toxic'")

# Wrapper model to include metadata in the final response
class IdentifyResponse(PlantIdentification):
    latency_ms: int

@app.post("/identify", response_model=IdentifyResponse)
def identify_plant(request: IdentifyRequest):
    dummy_clear = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    dummy_blurry = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="

    start_time = time.time()
    
    try:
        plant_info = client.chat.completions.create(
            model="google/gemini-3.5-flash",
            response_model=PlantIdentification,
            max_retries=2,
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert botanist and plant pathologist. Respond strictly to the schema."
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Identify this plant and its health."},
                        {"type": "image_url", "image_url": {"url": dummy_clear}}
                    ]
                },
                {
                    "role": "assistant",
                    "content": '{"common_name": "Monstera", "scientific_name": "Monstera deliciosa", "confidence": "high", "description": "A popular houseplant with large, glossy, perforated leaves.", "watering_frequency_days": 10, "sunlight_requirement": "indirect", "difficulty_level": "moderate", "plant_health": {"status": "healthy", "diagnosis": null, "treatment": null}, "disambiguation": null, "toxicity": "Toxic to pets if ingested"}'
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Identify this plant and its health."},
                        {"type": "image_url", "image_url": {"url": dummy_blurry}}
                    ]
                },
                {
                    "role": "assistant",
                    "content": '{"common_name": "Unknown Plant", "scientific_name": null, "confidence": "low", "description": "The image is too blurry to definitively identify the plant.", "watering_frequency_days": null, "sunlight_requirement": null, "difficulty_level": null, "plant_health": null, "disambiguation": "Could be a Pothos or a Heartleaf Philodendron. Please provide a clear, well-lit photo of a single leaf and the stem to confirm.", "toxicity": "unknown"}'
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Identify this plant and its health status."},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{request.image_base64}"}}
                    ]
                }
            ]
        )
        
        latency_ms = int((time.time() - start_time) * 1000)
        
        return IdentifyResponse(**plant_info.model_dump(), latency_ms=latency_ms)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference error: {str(e)}")