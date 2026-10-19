FROM node:20-alpine

WORKDIR /app

# Copiar manifiestos e instalar dependencias
COPY package*.json ./
RUN npm install

# Copiar el código fuente
COPY . .

EXPOSE 3000

# --host 0.0.0.0 es indispensable para que Podman exponga el servidor fuera del contenedor
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]