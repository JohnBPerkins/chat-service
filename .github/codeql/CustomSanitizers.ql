/**
 * @name Custom sanitizers for NoSQL injection
 * @description Marks validation functions as sanitizers for NoSQL injection
 * @kind path-problem
 * @id go/custom-nosql-sanitizers
 */

import go
import semmle.go.security.SqlInjectionCustomizations

/**
 * A call to a validation function that sanitizes user input
 */
class ValidationBarrier extends DataFlow::Node {
  ValidationBarrier() {
    exists(Function f, DataFlow::CallNode call |
      f.hasQualifiedName("github.com/JohnBPerkins/chat-service/backend/internal/validation",
        ["ValidateUserID", "ValidateEmail", "SanitizeString"]) and
      call = f.getACall() and
      this = call.getAnArgument()
    )
  }
}

from ValidationBarrier vb
select vb, "This is a validation barrier"
