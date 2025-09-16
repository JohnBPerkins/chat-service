# Ubuntu-based build for better compatibility
FROM golang:1.23

# Set working directory
WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN go mod tidy && go build -o main ./cmd/server

# Expose port
EXPOSE 8080

# Run the binary
CMD ["./main"]