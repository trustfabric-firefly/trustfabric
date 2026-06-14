FROM python:3.12-slim

WORKDIR /app

# xmlsec1 is required by python3-saml for SAML signature verification
RUN apt-get update \
    && apt-get install -y --no-install-recommends xmlsec1 libxmlsec1-openssl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# credentials are just copied from the build context
# (or from a bind mount during development)
COPY service-firebase.json /app/service-firebase.json

COPY app /app/app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]