FROM python:3.12-slim-bookworm

# Install system dependencies for WeasyPrint, Pango, and fonts for English + Urdu
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3-dev \
    libpango-1.0-0 \
    libharfbuzz0b \
    libpangoft2-1.0-0 \
    libffi-dev \
    shared-mime-info \
    fonts-dejavu-core \
    fonts-noto-core \
    fonts-noto-extra \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root application user for sandboxed execution
RUN useradd -m -u 1000 appuser

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=appuser:appuser . .

USER appuser

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
