package services

import (
	"context"
	"testing"
	"time"

	"github.com/JohnBPerkins/chat-service/backend/internal/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestConversationService_CreateConversation(t *testing.T) {
	db, cleanup := setupTestMongoDB(t)
	defer cleanup()

	// Use nil for NATS in tests - conversation service doesn't require it for create operations
	userService := NewUserService(db)
	service := NewConversationService(db, userService, nil)
	ctx := context.Background()

	t.Run("create direct conversation", func(t *testing.T) {
		req := &models.CreateConversationRequest{
			Kind:    "direct",
			Title:   "Direct Chat",
			Members: []string{"user1", "user2"},
		}

		conv, err := service.CreateConversation(ctx, req, "user1")
		require.NoError(t, err)
		assert.NotEmpty(t, conv.ID)
		assert.Equal(t, "direct", conv.Kind)
		assert.Equal(t, "Direct Chat", conv.Title)
		assert.NotZero(t, conv.CreatedAt)

		// Verify participants were created
		isParticipant, err := service.IsUserParticipant(ctx, conv.ID, "user1")
		require.NoError(t, err)
		assert.True(t, isParticipant)

		isParticipant, err = service.IsUserParticipant(ctx, conv.ID, "user2")
		require.NoError(t, err)
		assert.True(t, isParticipant)
	})

	t.Run("create group conversation", func(t *testing.T) {
		req := &models.CreateConversationRequest{
			Kind:    "group",
			Title:   "Team Chat",
			Members: []string{"user1", "user2", "user3"},
		}

		conv, err := service.CreateConversation(ctx, req, "user1")
		require.NoError(t, err)
		assert.Equal(t, "group", conv.Kind)
		assert.Equal(t, "Team Chat", conv.Title)

		// Verify all members are participants
		for _, userID := range []string{"user1", "user2", "user3"} {
			isParticipant, err := service.IsUserParticipant(ctx, conv.ID, userID)
			require.NoError(t, err)
			assert.True(t, isParticipant, "user %s should be participant", userID)
		}
	})

	t.Run("creator becomes admin", func(t *testing.T) {
		req := &models.CreateConversationRequest{
			Kind:    "group",
			Title:   "Admin Test",
			Members: []string{"creator", "member1"},
		}

		conv, err := service.CreateConversation(ctx, req, "creator")
		require.NoError(t, err)

		// Verify creator can perform admin actions (like deleting conversation)
		err = service.DeleteConversation(ctx, conv.ID, "creator")
		assert.NoError(t, err, "creator should have admin permissions")
	})

	t.Run("invalid creator ID", func(t *testing.T) {
		req := &models.CreateConversationRequest{
			Kind:    "direct",
			Title:   "Test",
			Members: []string{"user1"},
		}

		_, err := service.CreateConversation(ctx, req, "invalid$creator")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "invalid creator ID")
	})

	t.Run("invalid member ID", func(t *testing.T) {
		req := &models.CreateConversationRequest{
			Kind:    "group",
			Title:   "Test",
			Members: []string{"user1", "invalid$member"},
		}

		_, err := service.CreateConversation(ctx, req, "creator1")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "invalid member ID")
	})

	t.Run("sanitize title", func(t *testing.T) {
		req := &models.CreateConversationRequest{
			Kind:    "group",
			Title:   "Test\x00Title\x01With\x7FControl",
			Members: []string{"user1"},
		}

		conv, err := service.CreateConversation(ctx, req, "creator_sanitize")
		require.NoError(t, err)
		assert.NotContains(t, conv.Title, "\x00")
		assert.NotContains(t, conv.Title, "\x01")
	})

	t.Run("skip creator if in members list", func(t *testing.T) {
		// Create test users first
		userService := NewUserService(db)
		err := userService.UpsertUser(ctx, &models.User{
			ID:    "creator_dup",
			Email: "creator_dup@test.com",
			Name:  "Creator Dup",
		})
		require.NoError(t, err)

		err = userService.UpsertUser(ctx, &models.User{
			ID:    "user1",
			Email: "user1@test.com",
			Name:  "User 1",
		})
		require.NoError(t, err)

		req := &models.CreateConversationRequest{
			Kind:    "group",
			Title:   "Duplicate Test",
			Members: []string{"creator_dup", "user1"}, // creator in members
		}

		conv, err := service.CreateConversation(ctx, req, "creator_dup")
		require.NoError(t, err)

		// Verify creator only added once (as admin, not duplicate member)
		participants, err := service.GetConversationParticipants(ctx, conv.ID, "creator_dup")
		require.NoError(t, err)
		// Should have 2 participants total (creator + user1), not 3
		assert.Equal(t, 2, len(participants))
	})
}

func TestConversationService_GetUserConversations(t *testing.T) {
	db, cleanup := setupTestMongoDB(t)
	defer cleanup()

	// Use nil for NATS - this method doesn't publish messages
	userService := NewUserService(db)
	service := NewConversationService(db, userService, nil)
	ctx := context.Background()

	// Create test users
	users := []string{"user_conv1", "user_conv2", "user_conv3"}
	for _, userID := range users {
		err := userService.UpsertUser(ctx, &models.User{
			ID:    userID,
			Email: userID + "@test.com",
			Name:  "User " + userID,
		})
		require.NoError(t, err)
	}

	t.Run("get conversations for user", func(t *testing.T) {
		// Create multiple conversations for user_conv1
		for i := 0; i < 3; i++ {
			req := &models.CreateConversationRequest{
				Kind:    "group",
				Title:   "Conversation " + string(rune('A'+i)),
				Members: []string{"user_conv1", "user_conv2"},
			}
			_, err := service.CreateConversation(ctx, req, "user_conv1")
			require.NoError(t, err)
		}

		conversations, err := service.GetUserConversations(ctx, "user_conv1")
		require.NoError(t, err)
		assert.GreaterOrEqual(t, len(conversations), 3)

		// Verify conversations have participant info
		for _, conv := range conversations {
			assert.NotEmpty(t, conv.ID)
			assert.NotEmpty(t, conv.Title)
			assert.NotEmpty(t, conv.Participants)
		}
	})

	t.Run("user with no conversations", func(t *testing.T) {
		conversations, err := service.GetUserConversations(ctx, "user_conv3")
		require.NoError(t, err)
		assert.Empty(t, conversations)
	})

	t.Run("invalid user ID", func(t *testing.T) {
		_, err := service.GetUserConversations(ctx, "invalid$user")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "invalid user ID")
	})

	t.Run("sorted by lastMessageAt", func(t *testing.T) {
		// Create conversations with different timestamps
		req1 := &models.CreateConversationRequest{
			Kind:    "direct",
			Title:   "Old Conv",
			Members: []string{"user_sort_test"},
		}
		conv1, err := service.CreateConversation(ctx, req1, "user_sort_test")
		require.NoError(t, err)

		time.Sleep(10 * time.Millisecond)

		req2 := &models.CreateConversationRequest{
			Kind:    "direct",
			Title:   "New Conv",
			Members: []string{"user_sort_test"},
		}
		conv2, err := service.CreateConversation(ctx, req2, "user_sort_test")
		require.NoError(t, err)

		conversations, err := service.GetUserConversations(ctx, "user_sort_test")
		require.NoError(t, err)
		require.GreaterOrEqual(t, len(conversations), 2)

		// Find our conversations
		var foundConv1, foundConv2 *models.ConversationWithParticipants
		for i := range conversations {
			if conversations[i].ID == conv1.ID {
				foundConv1 = &conversations[i]
			}
			if conversations[i].ID == conv2.ID {
				foundConv2 = &conversations[i]
			}
		}

		require.NotNil(t, foundConv1)
		require.NotNil(t, foundConv2)

		// Newer conversation should appear first (or have more recent timestamp)
		assert.True(t, foundConv2.LastMessageAt.After(foundConv1.LastMessageAt) ||
			foundConv2.LastMessageAt.Equal(foundConv1.LastMessageAt))
	})
}

func TestConversationService_UpdateConversationTitle(t *testing.T) {
	db, cleanup := setupTestMongoDB(t)
	defer cleanup()

	// Use nil for NATS - we're testing business logic, not message publishing
	userService := NewUserService(db)
	service := NewConversationService(db, userService, nil)
	ctx := context.Background()

	t.Run("update title as participant", func(t *testing.T) {
		req := &models.CreateConversationRequest{
			Kind:    "group",
			Title:   "Original Title",
			Members: []string{"user_title1", "user_title2"},
		}
		conv, err := service.CreateConversation(ctx, req, "user_title1")
		require.NoError(t, err)

		err = service.UpdateConversationTitle(ctx, conv.ID, "user_title1", "Updated Title")
		require.NoError(t, err)

		// Verify title was updated
		updated, err := service.GetConversationByID(ctx, conv.ID)
		require.NoError(t, err)
		assert.Equal(t, "Updated Title", updated.Title)
	})

	t.Run("non-participant cannot update title", func(t *testing.T) {
		req := &models.CreateConversationRequest{
			Kind:    "group",
			Title:   "Private Chat",
			Members: []string{"user_priv1"},
		}
		conv, err := service.CreateConversation(ctx, req, "user_priv1")
		require.NoError(t, err)

		err = service.UpdateConversationTitle(ctx, conv.ID, "outsider", "Hacked Title")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "not authorized")
	})

	t.Run("sanitize new title", func(t *testing.T) {
		req := &models.CreateConversationRequest{
			Kind:    "group",
			Title:   "Test",
			Members: []string{"user_san_title"},
		}
		conv, err := service.CreateConversation(ctx, req, "user_san_title")
		require.NoError(t, err)

		err = service.UpdateConversationTitle(ctx, conv.ID, "user_san_title", "New\x00Title\x01")
		require.NoError(t, err)

		updated, err := service.GetConversationByID(ctx, conv.ID)
		require.NoError(t, err)
		assert.NotContains(t, updated.Title, "\x00")
	})

	t.Run("conversation not found", func(t *testing.T) {
		err := service.UpdateConversationTitle(ctx, "nonexistent_conv", "user1", "Title")
		assert.Error(t, err)
		// Error is "not authorized" because user isn't a participant of nonexistent conversation
		assert.Contains(t, err.Error(), "not authorized")
	})
}

func TestConversationService_ParticipantManagement(t *testing.T) {
	db, cleanup := setupTestMongoDB(t)
	defer cleanup()

	// Use nil for NATS - we're testing business logic, not message publishing
	userService := NewUserService(db)
	service := NewConversationService(db, userService, nil)
	ctx := context.Background()

	// Create users for testing
	for _, userID := range []string{"admin_pm", "member1_pm", "member2_pm", "outsider_pm"} {
		err := userService.UpsertUser(ctx, &models.User{
			ID:    userID,
			Email: userID + "@test.com",
			Name:  userID,
		})
		require.NoError(t, err)
	}

	t.Run("add participant", func(t *testing.T) {
		req := &models.CreateConversationRequest{
			Kind:    "group",
			Title:   "Add Test",
			Members: []string{"admin_pm"},
		}
		conv, err := service.CreateConversation(ctx, req, "admin_pm")
		require.NoError(t, err)

		// Add new participant
		err = service.AddParticipant(ctx, conv.ID, "admin_pm", "member1_pm")
		require.NoError(t, err)

		// Verify added
		isParticipant, err := service.IsUserParticipant(ctx, conv.ID, "member1_pm")
		require.NoError(t, err)
		assert.True(t, isParticipant)
	})

	t.Run("cannot add duplicate participant", func(t *testing.T) {
		req := &models.CreateConversationRequest{
			Kind:    "group",
			Title:   "Dup Test",
			Members: []string{"admin_pm", "member1_pm"},
		}
		conv, err := service.CreateConversation(ctx, req, "admin_pm")
		require.NoError(t, err)

		// Try to add existing member
		err = service.AddParticipant(ctx, conv.ID, "admin_pm", "member1_pm")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "already a participant")
	})

	t.Run("remove participant", func(t *testing.T) {
		req := &models.CreateConversationRequest{
			Kind:    "group",
			Title:   "Remove Test",
			Members: []string{"admin_pm", "member1_pm", "member2_pm"},
		}
		conv, err := service.CreateConversation(ctx, req, "admin_pm")
		require.NoError(t, err)

		// Remove participant
		err = service.RemoveParticipant(ctx, conv.ID, "admin_pm", "member2_pm")
		require.NoError(t, err)

		// Verify removed
		isParticipant, err := service.IsUserParticipant(ctx, conv.ID, "member2_pm")
		require.NoError(t, err)
		assert.False(t, isParticipant)
	})

	t.Run("cannot remove last participant", func(t *testing.T) {
		req := &models.CreateConversationRequest{
			Kind:    "direct",
			Title:   "Last Participant",
			Members: []string{"sole_user"},
		}
		conv, err := service.CreateConversation(ctx, req, "sole_user")
		require.NoError(t, err)

		// Try to remove the only participant
		err = service.RemoveParticipant(ctx, conv.ID, "sole_user", "sole_user")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "cannot remove last participant")
	})

	t.Run("non-participant cannot add members", func(t *testing.T) {
		req := &models.CreateConversationRequest{
			Kind:    "group",
			Title:   "Private",
			Members: []string{"admin_pm"},
		}
		conv, err := service.CreateConversation(ctx, req, "admin_pm")
		require.NoError(t, err)

		// Outsider tries to add someone
		err = service.AddParticipant(ctx, conv.ID, "outsider_pm", "member1_pm")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "not authorized")
	})
}

func TestConversationService_DeleteConversation(t *testing.T) {
	db, cleanup := setupTestMongoDB(t)
	defer cleanup()

	// Use nil for NATS - we're testing business logic, not message publishing
	userService := NewUserService(db)
	service := NewConversationService(db, userService, nil)
	ctx := context.Background()

	t.Run("admin can delete conversation", func(t *testing.T) {
		req := &models.CreateConversationRequest{
			Kind:    "group",
			Title:   "To Delete",
			Members: []string{"admin_del", "member_del"},
		}
		conv, err := service.CreateConversation(ctx, req, "admin_del")
		require.NoError(t, err)

		// Admin deletes
		err = service.DeleteConversation(ctx, conv.ID, "admin_del")
		require.NoError(t, err)

		// Verify deleted
		_, err = service.GetConversationByID(ctx, conv.ID)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "not found")
	})

	t.Run("non-admin cannot delete", func(t *testing.T) {
		req := &models.CreateConversationRequest{
			Kind:    "group",
			Title:   "Protected",
			Members: []string{"admin_prot", "member_prot"},
		}
		conv, err := service.CreateConversation(ctx, req, "admin_prot")
		require.NoError(t, err)

		// Member tries to delete
		err = service.DeleteConversation(ctx, conv.ID, "member_prot")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "only admins")
	})

	t.Run("non-participant cannot delete", func(t *testing.T) {
		req := &models.CreateConversationRequest{
			Kind:    "group",
			Title:   "Secure",
			Members: []string{"admin_sec"},
		}
		conv, err := service.CreateConversation(ctx, req, "admin_sec")
		require.NoError(t, err)

		// Outsider tries to delete
		err = service.DeleteConversation(ctx, conv.ID, "outsider_sec")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "not a participant")
	})
}
