# ------------------------------------------------------------------------------
# Stage 1: Build Environment
# ------------------------------------------------------------------------------
FROM ubuntu:22.04 AS builder

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    cmake \
    g++-12 \
    ninja-build \
    make \
    ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Use g++-12 as default compiler for C++20 standard library support
RUN update-alternatives --install /usr/bin/gcc gcc /usr/bin/gcc-12 100 \
 && update-alternatives --install /usr/bin/g++ g++ /usr/bin/g++-12 100

WORKDIR /src
COPY . .

# Build stripped release binary
RUN cmake -B build -S . -G Ninja \
    -DCMAKE_BUILD_TYPE=Release \
    -DREDISX_BUILD_TESTS=OFF \
    -DREDISX_BUILD_BENCHMARKS=OFF \
    -DREDISX_ENABLE_JEMALLOC=OFF \
 && cmake --build build --target redisx --parallel $(nproc) \
 && strip build/redisx

# ------------------------------------------------------------------------------
# Stage 2: Minimal Runtime Image
# ------------------------------------------------------------------------------
FROM ubuntu:22.04 AS runner

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    libstdc++6 \
    ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -r -u 999 -s /bin/false redisx

WORKDIR /data
RUN chown -R redisx:redisx /data

# Copy stripped binary from builder
COPY --from=builder /src/build/redisx /usr/local/bin/redisx
COPY redis.conf /etc/redisx/redis.conf

# Give redisx user ownership of config if needed
RUN chown -R redisx:redisx /etc/redisx

USER redisx
EXPOSE 6379 9121
VOLUME ["/data"]

ENTRYPOINT ["redisx"]
CMD ["-h", "0.0.0.0", "-p", "6379"]
