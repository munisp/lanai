FROM python:3.12-slim@sha256:2c941e860699f878900b0edc2403613c234d4b32eda3cc9fa7036991a2a63c4a
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt && useradd --create-home --uid 10002 lanai
COPY app.py ./app.py
USER lanai
EXPOSE 8200
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8200"]
