import base64
import requests

image_path = "test/images/sansevieria_snake-plant.png"

with open(image_path, "rb") as f:
    b64_data = base64.b64encode(f.read()).decode("utf-8")

response = requests.post(
    "http://localhost:8000/identify", json={"image_base64": b64_data}
)

print(response.json())
