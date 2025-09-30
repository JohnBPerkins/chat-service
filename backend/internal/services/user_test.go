package services

import (
	"context"
	"testing"
	"time"

	"github.com/JohnBPerkins/chat-service/backend/internal/models"
	"github.com/JohnBPerkins/chat-service/backend/pkg/database"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"
)

// setupTestMongoDB creates a test MongoDB container
func setupTestMongoDB(t *testing.T) (*database.MongoDB, func()) {
	ctx := context.Background()

	req := testcontainers.ContainerRequest{
		Image:        "mongo:7",
		ExposedPorts: []string{"27017/tcp"},
		WaitingFor:   wait.ForLog("Waiting for connections"),
	}

	mongoContainer, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: req,
		Started:          true,
	})
	require.NoError(t, err)

	host, err := mongoContainer.Host(ctx)
	require.NoError(t, err)

	port, err := mongoContainer.MappedPort(ctx, "27017")
	require.NoError(t, err)

	mongoURI := "mongodb://" + host + ":" + port.Port()
	db, err := database.NewMongoDB(mongoURI, "test_db")
	require.NoError(t, err)

	cleanup := func() {
		db.Close()
		mongoContainer.Terminate(ctx)
	}

	return db, cleanup
}

func TestUserService_UpsertUser(t *testing.T) {
	db, cleanup := setupTestMongoDB(t)
	defer cleanup()

	service := NewUserService(db)
	ctx := context.Background()

	t.Run("create new user", func(t *testing.T) {
		user := &models.User{
			ID:    "user123",
			Email: "test@example.com",
			Name:  "Test User",
		}

		err := service.UpsertUser(ctx, user)
		require.NoError(t, err)

		// Verify user was created
		retrieved, err := service.GetUserByID(ctx, "user123")
		require.NoError(t, err)
		assert.Equal(t, "user123", retrieved.ID)
		assert.Equal(t, "test@example.com", retrieved.Email)
		assert.Equal(t, "Test User", retrieved.Name)
	})

	t.Run("update existing user", func(t *testing.T) {
		user := &models.User{
			ID:    "user456",
			Email: "original@example.com",
			Name:  "Original Name",
		}

		// Create user
		err := service.UpsertUser(ctx, user)
		require.NoError(t, err)

		// Update user
		user.Name = "Updated Name"
		user.Email = "updated@example.com"
		err = service.UpsertUser(ctx, user)
		require.NoError(t, err)

		// Verify update
		retrieved, err := service.GetUserByID(ctx, "user456")
		require.NoError(t, err)
		assert.Equal(t, "Updated Name", retrieved.Name)
		assert.Equal(t, "updated@example.com", retrieved.Email)
	})

	t.Run("invalid user ID", func(t *testing.T) {
		user := &models.User{
			ID:    "user$invalid",
			Email: "test@example.com",
			Name:  "Test",
		}

		err := service.UpsertUser(ctx, user)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "invalid user ID")
	})

	t.Run("invalid email", func(t *testing.T) {
		user := &models.User{
			ID:    "user789",
			Email: "not-an-email",
			Name:  "Test",
		}

		err := service.UpsertUser(ctx, user)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "invalid email")
	})

	t.Run("name too long", func(t *testing.T) {
		// Create a name with 101 characters (over the 100 char limit)
		longName := ""
		for i := 0; i < 101; i++ {
			longName += "a"
		}

		user := &models.User{
			ID:    "user999",
			Email: "test@example.com",
			Name:  longName,
		}

		err := service.UpsertUser(ctx, user)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "invalid name")
	})

	t.Run("sanitize dangerous characters in name", func(t *testing.T) {
		user := &models.User{
			ID:    "user_sanitize",
			Email: "sanitize@example.com",
			Name:  "Test\x00Name\x01With\x7FControl",
		}

		err := service.UpsertUser(ctx, user)
		require.NoError(t, err)

		retrieved, err := service.GetUserByID(ctx, "user_sanitize")
		require.NoError(t, err)
		// Control characters should be removed
		assert.NotContains(t, retrieved.Name, "\x00")
		assert.NotContains(t, retrieved.Name, "\x01")
		assert.NotContains(t, retrieved.Name, "\x7F")
	})
}

func TestUserService_GetUserByID(t *testing.T) {
	db, cleanup := setupTestMongoDB(t)
	defer cleanup()

	service := NewUserService(db)
	ctx := context.Background()

	t.Run("get existing user", func(t *testing.T) {
		// Create user first
		user := &models.User{
			ID:    "existing_user",
			Email: "existing@example.com",
			Name:  "Existing User",
		}
		err := service.UpsertUser(ctx, user)
		require.NoError(t, err)

		// Get user
		retrieved, err := service.GetUserByID(ctx, "existing_user")
		require.NoError(t, err)
		assert.Equal(t, "existing_user", retrieved.ID)
		assert.Equal(t, "existing@example.com", retrieved.Email)
	})

	t.Run("user not found", func(t *testing.T) {
		_, err := service.GetUserByID(ctx, "nonexistent_user")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "user not found")
	})

	t.Run("invalid user ID format", func(t *testing.T) {
		_, err := service.GetUserByID(ctx, "invalid$user")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "invalid user ID")
	})

	t.Run("empty user ID", func(t *testing.T) {
		_, err := service.GetUserByID(ctx, "")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "invalid user ID")
	})
}

func TestUserService_GetUserByEmail(t *testing.T) {
	db, cleanup := setupTestMongoDB(t)
	defer cleanup()

	service := NewUserService(db)
	ctx := context.Background()

	t.Run("get user by email", func(t *testing.T) {
		// Create user
		user := &models.User{
			ID:    "email_test_user",
			Email: "findme@example.com",
			Name:  "Find Me",
		}
		err := service.UpsertUser(ctx, user)
		require.NoError(t, err)

		// Get by email
		retrieved, err := service.GetUserByEmail(ctx, "findme@example.com")
		require.NoError(t, err)
		assert.Equal(t, "email_test_user", retrieved.ID)
		assert.Equal(t, "findme@example.com", retrieved.Email)
	})

	t.Run("email not found", func(t *testing.T) {
		_, err := service.GetUserByEmail(ctx, "notfound@example.com")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "user not found")
	})

	t.Run("invalid email format", func(t *testing.T) {
		_, err := service.GetUserByEmail(ctx, "not-an-email")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "invalid email")
	})

	t.Run("empty email", func(t *testing.T) {
		_, err := service.GetUserByEmail(ctx, "")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "invalid email")
	})

	t.Run("email with injection attempt", func(t *testing.T) {
		_, err := service.GetUserByEmail(ctx, "test@example.com{$where: 1}")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "invalid email")
	})
}

func TestUserService_ConcurrentOperations(t *testing.T) {
	db, cleanup := setupTestMongoDB(t)
	defer cleanup()

	service := NewUserService(db)
	ctx := context.Background()

	t.Run("concurrent upserts same user", func(t *testing.T) {
		// Multiple goroutines trying to upsert the same user
		done := make(chan bool, 10)

		for i := 0; i < 10; i++ {
			go func(n int) {
				user := &models.User{
					ID:    "concurrent_user",
					Email: "concurrent@example.com",
					Name:  "Concurrent Test",
				}
				err := service.UpsertUser(ctx, user)
				assert.NoError(t, err)
				done <- true
			}(i)
		}

		// Wait for all to complete
		for i := 0; i < 10; i++ {
			select {
			case <-done:
			case <-time.After(5 * time.Second):
				t.Fatal("Timeout waiting for concurrent operations")
			}
		}

		// Verify user exists and is consistent
		user, err := service.GetUserByID(ctx, "concurrent_user")
		require.NoError(t, err)
		assert.Equal(t, "concurrent_user", user.ID)
	})
}
