FROM rust:1.99.1-bookworm AS builder

WORKDIR /app

COPY Cargo.toml Cargo.lock ./
COPY src ./src

RUN /usr/local/cargo/bin/cargo build \
    --release \
    --locked

FROM debian:bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY --from=builder \
  /app/target/release/kiyt-gateway \
  /usr/local/bin/kiyt-gateway

USER 65534:65534

EXPOSE 8080

CMD ["/usr/local/bin/kiyt-gateway"]
