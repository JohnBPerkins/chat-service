package validation

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
)

var (
	ErrInvalidInput   = errors.New("invalid input")
	ErrInputTooLong   = errors.New("input too long")
	ErrInvalidFormat  = errors.New("invalid format")
)

// ValidateUserID validates and sanitizes user IDs
// User IDs should be alphanumeric with limited special characters
// This function acts as a sanitization barrier for NoSQL injection
// Returns the sanitized user ID to ensure CodeQL tracks the sanitization
func ValidateUserID(userID string) (string, error) {
	if userID == "" {
		return "", fmt.Errorf("%w: user ID cannot be empty", ErrInvalidInput)
	}

	if len(userID) > 255 {
		return "", fmt.Errorf("%w: user ID too long (max 255 chars)", ErrInputTooLong)
	}

	// Allow alphanumeric, hyphens, underscores, dots, @ for emails only
	if matched, _ := regexp.MatchString(`^[a-zA-Z0-9_@.:-]+$`, userID); !matched {
		return "", fmt.Errorf("%w: user ID contains invalid characters", ErrInvalidFormat)
	}

	// Return the validated ID (same as input since it passed validation)
	return userID, nil
}

// ValidateEmail validates email format and prevents injection
// Returns the sanitized email to ensure CodeQL tracks the sanitization
func ValidateEmail(email string) (string, error) {
	if email == "" {
		return "", fmt.Errorf("%w: email cannot be empty", ErrInvalidInput)
	}

	if len(email) > 320 { // RFC 5321 limit
		return "", fmt.Errorf("%w: email too long (max 320 chars)", ErrInputTooLong)
	}

	// Basic email regex - more restrictive for security
	emailRegex := `^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`
	if matched, _ := regexp.MatchString(emailRegex, email); !matched {
		return "", fmt.Errorf("%w: invalid email format", ErrInvalidFormat)
	}

	// Check for MongoDB operators and injection patterns
	if containsNoSQLOperators(email) {
		return "", fmt.Errorf("%w: email contains prohibited characters", ErrInvalidInput)
	}

	// Return the validated email
	return email, nil
}

// containsNoSQLOperators checks for common NoSQL injection patterns
func containsNoSQLOperators(input string) bool {
	// Check for MongoDB operators
	mongoOperators := []string{
		"$where", "$regex", "$ne", "$gt", "$lt", "$gte", "$lte",
		"$in", "$nin", "$exists", "$type", "$mod", "$all", "$size",
		"$elemMatch", "$not", "$or", "$and", "$nor", "$expr",
	}

	lowercaseInput := strings.ToLower(input)
	for _, operator := range mongoOperators {
		if strings.Contains(lowercaseInput, operator) {
			return true
		}
	}

	// Check for JavaScript injection patterns
	jsPatterns := []string{
		"function", "javascript:", "eval(", "setTimeout", "setInterval",
	}

	for _, pattern := range jsPatterns {
		if strings.Contains(lowercaseInput, pattern) {
			return true
		}
	}

	return false
}

// SanitizeString removes potentially dangerous characters while preserving valid input
func SanitizeString(input string, maxLength int) (string, error) {
	if len(input) > maxLength {
		return "", fmt.Errorf("%w: input exceeds maximum length of %d", ErrInputTooLong, maxLength)
	}

	// Remove null bytes and control characters
	sanitized := strings.ReplaceAll(input, "\x00", "")

	// Remove other control characters (0x01-0x1F, 0x7F)
	var result strings.Builder
	for _, r := range sanitized {
		if r >= 32 && r != 127 {
			result.WriteRune(r)
		}
	}

	output := result.String()

	// Check for injection patterns after sanitization
	if containsNoSQLOperators(output) {
		return "", fmt.Errorf("%w: input contains prohibited operators", ErrInvalidInput)
	}

	return output, nil
}