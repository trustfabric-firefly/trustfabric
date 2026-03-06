FROM python:3.12-slim

WORKDIR /app

# Copy requirements and install
COPY requirements.txt .

RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Accept Firebase credentials file as a build argument
ARG FIREBASE_CREDENTIALS_FILE=firebase_credentials.json
ENV FIREBASE_CREDENTIALS_FILE=${FIREBASE_CREDENTIALS_FILE}

# Copy Firebase credentials file
# During local dev, it copies from local folder
# During CI, the file is created from GitHub Secret
COPY ${FIREBASE_CREDENTIALS_FILE} ./firebase_credentials.json

# Copy the app code
COPY app ./app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]