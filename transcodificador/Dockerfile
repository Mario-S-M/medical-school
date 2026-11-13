# Transcodificador de videos de clase (SPEC 08): ffmpeg y una API mínima en Python estándar.
FROM python:3.13-alpine

RUN apk add --no-cache ffmpeg \
 && addgroup -g 10001 transcodificador && adduser -D -u 10001 -G transcodificador transcodificador \
 && mkdir /trabajo && chown 10001:10001 /trabajo

COPY servidor.py /app/servidor.py
USER 10001:10001
WORKDIR /app
EXPOSE 8090
CMD ["python", "-u", "servidor.py"]
