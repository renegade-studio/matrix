# --- Build Stage ---
FROM golang:1.22-alpine AS builder

# Set the Current Working Directory inside the container
WORKDIR /app

# Copy go mod and sum files
COPY go.mod go.sum ./
# Download all dependencies. Dependencies will be cached if the go.mod and go.sum files are not changed
RUN go mod download

# Copy the source code
COPY . .

# Build the Go app
# -ldflags="-w -s" strips debug information and symbols, reducing the binary size.
# CGO_ENABLED=0 ensures the binary is statically linked.
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /matrix-server ./cmd/matrix-server

# --- Final Stage ---
FROM alpine:latest

# Add a non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Set the Current Working Directory inside the container
WORKDIR /app

# Copy the Pre-built binary file from the previous stage
COPY --from=builder /matrix-server /app/matrix-server

# Copy the configuration file. Note: This assumes matrix.yml is in the build context.
# We will mount the actual config via podman-compose.
# COPY matrix.yml /app/matrix.yml

# Expose port 3000 to the outside world
EXPOSE 3000

# Switch to our non-root user
USER appuser

# Command to run the executable
CMD ["./matrix-server"]
