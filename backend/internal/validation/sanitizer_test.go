package validation

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestValidateUserID(t *testing.T) {
	tests := []struct {
		name    string
		userID  string
		wantErr bool
	}{
		{
			name:    "valid user ID",
			userID:  "user123",
			wantErr: false,
		},
		{
			name:    "valid user ID with hyphens",
			userID:  "user-123-abc",
			wantErr: false,
		},
		{
			name:    "valid user ID with underscores",
			userID:  "user_123_abc",
			wantErr: false,
		},
		{
			name:    "empty user ID",
			userID:  "",
			wantErr: true,
		},
		{
			name:    "user ID too long",
			userID:  string(make([]byte, 256)), // 256 chars, over limit
			wantErr: true,
		},
		{
			name:    "user ID with injection attempt",
			userID:  "user123{$where: function(){return true}}",
			wantErr: true,
		},
		{
			name:    "user ID with special characters",
			userID:  "user#123",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sanitized, err := ValidateUserID(tt.userID)
			if tt.wantErr {
				assert.Error(t, err)
				assert.Empty(t, sanitized)
			} else {
				assert.NoError(t, err)
				assert.Equal(t, tt.userID, sanitized)
			}
		})
	}
}

func TestValidateEmail(t *testing.T) {
	tests := []struct {
		name    string
		email   string
		wantErr bool
	}{
		{
			name:    "valid email",
			email:   "user@example.com",
			wantErr: false,
		},
		{
			name:    "valid email with plus",
			email:   "user+tag@example.com",
			wantErr: false,
		},
		{
			name:    "empty email",
			email:   "",
			wantErr: true,
		},
		{
			name:    "email too long",
			email:   string(make([]byte, 321)) + "@example.com",
			wantErr: true,
		},
		{
			name:    "invalid email format",
			email:   "notanemail",
			wantErr: true,
		},
		{
			name:    "email with MongoDB operator",
			email:   "user@example.com{$where: 1}",
			wantErr: true,
		},
		{
			name:    "email with regex injection",
			email:   "user@example.com/$regex/",
			wantErr: true,
		},
		{
			name:    "email with JavaScript injection",
			email:   "user@example.com<script>alert(1)</script>",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sanitized, err := ValidateEmail(tt.email)
			if tt.wantErr {
				assert.Error(t, err)
				assert.Empty(t, sanitized)
			} else {
				assert.NoError(t, err)
				assert.Equal(t, tt.email, sanitized)
			}
		})
	}
}

func TestContainsNoSQLOperators(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected bool
	}{
		{
			name:     "clean input",
			input:    "normal text",
			expected: false,
		},
		{
			name:     "contains $where",
			input:    "text with $where operator",
			expected: true,
		},
		{
			name:     "contains $regex",
			input:    "text with $regex operator",
			expected: true,
		},
		{
			name:     "contains JavaScript function",
			input:    "text with function() {}",
			expected: true,
		},
		{
			name:     "contains eval",
			input:    "text with eval(",
			expected: true,
		},
		{
			name:     "case insensitive detection",
			input:    "text with $WHERE operator",
			expected: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := containsNoSQLOperators(tt.input)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestSanitizeString(t *testing.T) {
	tests := []struct {
		name      string
		input     string
		maxLength int
		expected  string
		wantErr   bool
	}{
		{
			name:      "normal string",
			input:     "Hello World",
			maxLength: 20,
			expected:  "Hello World",
			wantErr:   false,
		},
		{
			name:      "string with null bytes",
			input:     "Hello\x00World",
			maxLength: 20,
			expected:  "HelloWorld",
			wantErr:   false,
		},
		{
			name:      "string too long",
			input:     "This is a very long string",
			maxLength: 10,
			expected:  "",
			wantErr:   true,
		},
		{
			name:      "string with MongoDB operators",
			input:     "text with $where",
			maxLength: 20,
			expected:  "",
			wantErr:   true,
		},
		{
			name:      "string with control characters",
			input:     "Hello\x01\x02World\x7F",
			maxLength: 20,
			expected:  "HelloWorld",
			wantErr:   false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := SanitizeString(tt.input, tt.maxLength)
			if tt.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
				assert.Equal(t, tt.expected, result)
			}
		})
	}
}