# Cognita — single-container build
# Backend serves the API and the static frontend from one process,
# which keeps AWS deployment (App Runner / Elastic Beanstalk / EC2) simple.

FROM python:3.12-slim

WORKDIR /app

# Install backend dependencies first (better Docker layer caching)
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy application code
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# App Runner / most AWS services expect the container to listen on $PORT
ENV PORT=8000
EXPOSE 8000

# NOTE: OPENAI_API_KEY is NOT baked into the image.
# It is injected at runtime via AWS environment variables / secrets.
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT}"]
