FROM python:3.12-slim-bookworm
WORKDIR /workspace
COPY tests/security/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt
COPY backend/ backend/
COPY supabase/ supabase/
COPY tests/security/run_checks.py tests/security/run_checks.py
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
USER 65534:65534
CMD ["python", "tests/security/run_checks.py"]
