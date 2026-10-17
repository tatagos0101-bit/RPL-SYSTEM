FROM python:3.11-slim

ARG CACHEBUST=2

# System libraries required by OpenCV (headless) and face_recognition/dlib
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    libopenblas0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .

# Install pre-compiled dlib (no cmake compilation needed)
RUN pip install --no-cache-dir dlib-bin==20.0.1.post1

# Install face_recognition without re-pulling dlib (already installed above)
RUN pip install --no-cache-dir face_recognition==1.3.0 --no-deps
RUN pip install --no-cache-dir face_recognition_models==0.3.0

# Install everything else except face_recognition (already handled above)
RUN grep -v "^face_recognition" requirements.txt > /tmp/req.txt && \
    pip install --no-cache-dir -r /tmp/req.txt

COPY . .

EXPOSE 8000

CMD ["python", "run.py"]
