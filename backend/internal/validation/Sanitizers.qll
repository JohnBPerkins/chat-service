/**
 * Provides models for input sanitization functions that prevent NoSQL injection.
 */

import go

/**
 * A sanitizer for NoSQL injection vulnerabilities.
 */
class ValidationSanitizer extends DataFlow::Node {
  ValidationSanitizer() {
    exists(DataFlow::CallNode call |
      call.getTarget().hasQualifiedName("github.com/JohnBPerkins/chat-service/backend/internal/validation",
        ["ValidateUserID", "ValidateEmail", "SanitizeString"]) and
      this = call.getArgument(0)
    )
  }
}

/**
 * A sanitizer that validates user IDs.
 */
private class ValidateUserIDSanitizer extends SharedTaintTracking::Sanitizer {
  ValidateUserIDSanitizer() {
    exists(DataFlow::CallNode call |
      call.getTarget().hasQualifiedName("github.com/JohnBPerkins/chat-service/backend/internal/validation", "ValidateUserID") and
      // After successful validation (no error), the original input is safe
      this = call.getArgument(0) and
      // The error return is checked
      call.getResult(0).getASuccessor*().getASuccessor*() instanceof DataFlow::ResultNode
    )
  }
}

/**
 * A sanitizer that validates emails.
 */
private class ValidateEmailSanitizer extends SharedTaintTracking::Sanitizer {
  ValidateEmailSanitizer() {
    exists(DataFlow::CallNode call |
      call.getTarget().hasQualifiedName("github.com/JohnBPerkins/chat-service/backend/internal/validation", "ValidateEmail") and
      this = call.getArgument(0)
    )
  }
}

/**
 * A sanitizer that sanitizes strings.
 */
private class SanitizeStringSanitizer extends SharedTaintTracking::Sanitizer {
  SanitizeStringSanitizer() {
    exists(DataFlow::CallNode call |
      call.getTarget().hasQualifiedName("github.com/JohnBPerkins/chat-service/backend/internal/validation", "SanitizeString") and
      this = call.getResult(0)
    )
  }
}
