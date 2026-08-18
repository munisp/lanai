FROM python:3.12.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

WORKDIR /app

COPY lanai_ai/pillars/whatsapp/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

COPY lanai_ai /app/lanai_ai

RUN groupadd --gid 10001 lanai \
    && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin lanai \
    && mkdir -p /tmp/bridge \
    && chown -R 10001:10001 /app /tmp/bridge

USER 10001:10001
EXPOSE 5555
CMD ["python", "-m", "lanai_ai.pillars.whatsapp.whatsapp_ai_bridge"]
