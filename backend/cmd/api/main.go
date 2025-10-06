package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
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
	log.Println("Starting REST API Server...")

	// Load configuration
	mongoURI := getEnv("MONGODB_URI", "")
	if mongoURI == "" {
		mongoURI = getEnv("MONGO_URL", "mongodb://localhost:27017")
	}

	config := &Config{
		Port:           getEnv("PORT", "8080"),
		MongoURI:       mongoURI,
		DatabaseName:   getEnv("DATABASE_NAME", "chat_service"),
		NATSUrl:        getEnv("NATS_URL", "nats://localhost:4222"),
		AllowedOrigins: getEnv("ALLOWED_ORIGINS", "http://localhost:3000"),
	}

	// Initialize MongoDB
	log.Printf("Connecting to MongoDB (database: %s)...", config.DatabaseName)
	db, err := database.NewMongoDB(config.MongoURI, config.DatabaseName)
	if err != nil {
		maskedURI := maskURI(config.MongoURI)
		log.Fatalf("Failed to connect to MongoDB (%s): %v", maskedURI, err)
	}
	log.Printf("Successfully connected to MongoDB")
	defer db.Close()

	// Initialize NATS
	log.Println("Connecting to NATS...")
	nc, err := nats.NewConnection(config.NATSUrl)
	if err != nil {
		log.Fatalf("Failed to connect to NATS: %v", err)
	}
	log.Printf("Successfully connected to NATS")
	defer nc.Close()

	// Initialize services
	userService := services.NewUserService(db)
	conversationService := services.NewConversationService(db, userService, nc)
	messageService := services.NewMessageService(db, nc, userService)
	friendService := services.NewFriendService(db, nc, userService, conversationService)

	// Initialize handlers
	handlers := &handlers.Handlers{
		UserService:         userService,
		ConversationService: conversationService,
		MessageService:      messageService,
		FriendService:       friendService,
	}

	// Setup router
	r := chi.NewRouter()

	// Middleware
	r.Use(chimiddleware.Logger)
	r.Use(chimiddleware.Recoverer)
	r.Use(chimiddleware.Timeout(60 * time.Second))
	r.Use(chimiddleware.RequestID)

	// CORS
	allowedOrigins := parseAllowedOrigins(config.AllowedOrigins)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   allowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Health check
	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok","service":"api"}`))
	})

	// API routes
	r.Route("/v1", func(r chi.Router) {
		// User routes
		r.Get("/me", handlers.GetCurrentUser)
		r.Put("/users/me", handlers.UpsertUser)

		// Conversation routes
		r.Get("/conversations", handlers.GetConversations)
		r.Post("/conversations", handlers.CreateConversation)
		r.Delete("/conversations/{id}", handlers.DeleteConversation)
		r.Get("/conversations/{id}/messages", handlers.GetMessages)

		// Conversation management routes
		r.Get("/conversations/{id}/participants", handlers.GetConversationParticipants)
		r.Put("/conversations/{id}/title", handlers.UpdateConversationTitle)
		r.Post("/conversations/{id}/participants", handlers.AddParticipant)
		r.Delete("/conversations/{id}/participants/{userId}", handlers.RemoveParticipant)

		// Message routes
		r.Post("/messages", handlers.SendMessage)
		r.Post("/messages/{id}/read", handlers.MarkMessageAsRead)
		r.Delete("/messages/{id}", handlers.DeleteMessage)

		// Friend routes
		r.Get("/friends", handlers.GetFriends)
		r.Get("/friend-requests", handlers.GetPendingFriendRequests)
	})

	// Start server
	srv := &http.Server{
		Addr:         ":" + config.Port,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Graceful shutdown
	go func() {
		log.Printf("REST API Server listening on port %s", config.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server failed to start: %v", err)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down REST API server...")

	// Graceful shutdown with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("REST API Server exited")
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

func maskURI(uri string) string {
	if len(uri) > 20 {
		return uri[:12] + "..." + uri[len(uri)-8:]
	}
	return uri
}

func parseAllowedOrigins(originsStr string) []string {
	allowedOrigins := []string{"http://localhost:3000"} // default
	if originsStr != "" {
		origins := strings.Split(originsStr, ",")
		allowedOrigins = make([]string, len(origins))
		for i, origin := range origins {
			allowedOrigins[i] = strings.TrimSpace(origin)
			// Remove trailing slash if present
			if strings.HasSuffix(allowedOrigins[i], "/") {
				allowedOrigins[i] = allowedOrigins[i][:len(allowedOrigins[i])-1]
			}
		}
	}
	return allowedOrigins
}
