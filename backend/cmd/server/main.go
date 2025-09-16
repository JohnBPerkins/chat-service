package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/JohnBPerkins/chat-service/backend/internal/handlers"
	"github.com/JohnBPerkins/chat-service/backend/internal/services"
	"github.com/JohnBPerkins/chat-service/backend/pkg/database"
	"github.com/JohnBPerkins/chat-service/backend/pkg/nats"
	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

func main() {
	// Load configuration
	config := &Config{
		Port:           getEnv("PORT", "8080"),
		MongoURI:       getEnv("MONGODB_URI", "mongodb://localhost:27017"),
		DatabaseName:   getEnv("DATABASE_NAME", "chat_service"),
		NATSUrl:        getEnv("NATS_URL", "nats://localhost:4222"),
		AllowedOrigins: getEnv("ALLOWED_ORIGINS", "http://localhost:3000"),
	}

	// Initialize MongoDB
	db, err := database.NewMongoDB(config.MongoURI, config.DatabaseName)
	if err != nil {
		log.Fatalf("Failed to connect to MongoDB: %v", err)
	}
	defer db.Close()

	// Initialize NATS
	nc, err := nats.NewConnection(config.NATSUrl)
	if err != nil {
		log.Fatalf("Failed to connect to NATS: %v", err)
	}
	defer nc.Close()

	// Initialize services
	userService := services.NewUserService(db)
	conversationService := services.NewConversationService(db, userService)
	messageService := services.NewMessageService(db, nc, userService)

	// Initialize handlers
	handlers := &handlers.Handlers{
		UserService:         userService,
		ConversationService: conversationService,
		MessageService:      messageService,
		WebSocketHub:        services.NewWebSocketHub(messageService, nc),
	}

	// Setup router
	r := chi.NewRouter()

	// Middleware
	r.Use(chimiddleware.Logger)
	r.Use(chimiddleware.Recoverer)
	r.Use(chimiddleware.Timeout(60 * time.Second))

	// CORS
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{config.AllowedOrigins},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Health check
	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	// API routes (no JWT middleware - using GitHub OAuth only)
	r.Route("/v1", func(r chi.Router) {
		// User routes
		r.Get("/me", handlers.GetCurrentUser)
		r.Put("/users/me", handlers.UpsertUser)

		// Conversation routes
		r.Get("/conversations", handlers.GetConversations)
		r.Post("/conversations", handlers.CreateConversation)
		r.Get("/conversations/{id}/messages", handlers.GetMessages)

		// Message routes
		r.Post("/messages", handlers.SendMessage)
		r.Post("/messages/{id}/read", handlers.MarkMessageAsRead)
	})

	// WebSocket endpoint
	r.Get("/ws", handlers.HandleWebSocket)

	// Start server
	srv := &http.Server{
		Addr:    ":" + config.Port,
		Handler: r,
	}

	// Graceful shutdown
	go func() {
		log.Printf("Server starting on port %s", config.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server failed to start: %v", err)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down server...")

	// Graceful shutdown with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server exited")
}

type Config struct {
	Port           string
	MongoURI       string
	DatabaseName   string
	NATSUrl        string
	AllowedOrigins string
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}