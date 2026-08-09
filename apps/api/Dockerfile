FROM python:3.11.9-slim
WORKDIR /app
COPY apps/api/requirements.txt .
RUN pip install --no-cache-dir --prefer-binary -r requirements.txt
COPY apps/api/ .
COPY packages/ ./packages/
ENV PYTHONPATH=/app
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
