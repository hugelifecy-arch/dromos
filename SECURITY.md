# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in Dromos, please report it responsibly.

**DO NOT** open a public GitHub issue for security vulnerabilities.

### How to Report

1. Email: Send details to the repository owner via private communication
2. 2. Include: Description of the vulnerability, steps to reproduce, potential impact
   3. 3. Timeline: We aim to acknowledge within 48 hours and provide a fix within 7 days
     
      4. ### What to Expect
     
      5. - Acknowledgment of your report within 48 hours
         - - Regular updates on the progress of addressing the vulnerability
           - - Credit in the security advisory (if desired)
            
             - ## Security Best Practices for Contributors
            
             - - Never commit secrets, API keys, or credentials to the repository
               - - Always use environment variables for sensitive configuration
                 - - Keep dependencies updated and review Dependabot alerts promptly
                   - - Follow the principle of least privilege in all code
                     - - Validate and sanitize all user inputs
                       - - Use parameterized queries to prevent SQL injection
                         - - Implement proper authentication and authorization checks
                           - - Use HTTPS for all external communications
                             - - Enable CORS only for trusted origins
                               - - Log security events but never log sensitive data
                                
                                 - ## Security Features
                                
                                 - - JWT-based authentication with token rotation
                                   - - Input validation and sanitization on all endpoints
                                     - - Rate limiting to prevent brute force attacks
                                       - - Encrypted data at rest and in transit
                                         - - CORS configuration for trusted origins only
                                           - - Helmet.js for HTTP security headers
                                             - - CSRF protection on all state-changing operations
                                               - - SQL injection prevention via parameterized queries
                                                 - - XSS prevention via output encoding
