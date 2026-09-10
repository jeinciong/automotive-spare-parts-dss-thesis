FROM node:20-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libgomp1 python3 python3-venv \
    && rm -rf /var/lib/apt/lists/*

ENV VIRTUAL_ENV=/opt/venv
RUN python3 -m venv "$VIRTUAL_ENV"
ENV PATH="$VIRTUAL_ENV/bin:$PATH" \
    PYTHON_BIN=/opt/venv/bin/python \
    NODE_ENV=production

WORKDIR /app

COPY backend/package.json backend/package-lock.json ./
COPY backend/prisma ./prisma
COPY backend/scripts ./scripts
RUN npm ci

COPY backend/python/requirements.txt ./python/requirements.txt
RUN pip install --no-cache-dir -r python/requirements.txt

COPY backend/ ./
RUN npm run build

EXPOSE 5000
CMD ["npm", "start"]
