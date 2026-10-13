FROM python:3.12-slim

WORKDIR /app
COPY parse.py bowling.py ./

ENV PYTHONUNBUFFERED=1
ENTRYPOINT ["python", "parse.py"]
