FROM ubuntu:22.04 AS builder
RUN apt-get update && apt-get install -y cmake g++ make
WORKDIR /app
COPY . .
RUN cmake -B build-docker -S . && cmake --build build-docker

FROM ubuntu:22.04
WORKDIR /app
COPY --from=builder /app/build-docker/redisx /usr/local/bin/redisx
EXPOSE 6379 9121
CMD ["redisx"]
